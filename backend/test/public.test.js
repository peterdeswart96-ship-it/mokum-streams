const test = require('node:test');
const assert = require('node:assert');
const { buildLiveTables, buildSchedule } = require('../src/public/live');

test('buildLiveTables geeft live/scheduled/offline per cameratafel', () => {
  const store = {
    '1': { videoId: 'v1', title: 'Tafel 1 Fluke', scheduledStart: '2026-07-14T17:30:00Z', tournamentName: 'Fluke' },
    '3': { videoId: 'v3', title: 'Tafel 3 Fluke', scheduledStart: '2026-07-14T17:30:00Z', tournamentName: 'Fluke' },
  };
  const status = { tables: [{ tableNumber: 1, streaming: true }, { tableNumber: 3, streaming: false }] };
  const res = buildLiveTables([1, 3, 15], store, status);
  const byT = Object.fromEntries(res.map((r) => [r.tableNumber, r]));
  assert.strictEqual(byT[1].status, 'live'); // agent meldt streaming
  assert.strictEqual(byT[1].videoId, 'v1');
  assert.strictEqual(byT[3].status, 'scheduled'); // broadcast klaar, nog niet live
  assert.strictEqual(byT[15].status, 'offline'); // geen broadcast
  assert.strictEqual(byT[15].videoId, null);
});

test('buildLiveTables geeft quality + overlays door voor een live tafel, null voor de rest', () => {
  const store = { '1': { videoId: 'v1', title: 'T1' }, '3': { videoId: 'v3', title: 'T3' } };
  const status = {
    tables: [
      {
        tableNumber: 1, streaming: true, bitrateKbps: 9000, resolution: '1920x1080', fps: 60,
        overlays: { sponsors: true, scoreboard: false, scoresOtherTables: true, cuescoreLogo: true },
      },
      { tableNumber: 3, streaming: false, resolution: '1920x1080', fps: 60 }, // wel gemeld, maar niet live
    ],
  };
  const byT = Object.fromEntries(buildLiveTables([1, 3, 15], store, status).map((r) => [r.tableNumber, r]));
  // Live tafel: kwaliteit + overlays doorgegeven
  assert.deepStrictEqual(byT[1].quality, { resolution: '1920x1080', fps: 60, bitrateKbps: 9000 });
  assert.strictEqual(byT[1].overlays.scoreboard, false);
  // Scheduled (niet live): geen stale kwaliteit/overlays
  assert.strictEqual(byT[3].quality, null);
  assert.strictEqual(byT[3].overlays, null);
  // Offline zonder agent-data
  assert.strictEqual(byT[15].quality, null);
  assert.strictEqual(byT[15].overlays, null);
});

test('buildLiveTables: een gestopte entry telt als offline (geen videoId)', () => {
  const store = { '1': { videoId: 'v1', title: 'Tafel 1 Test', stopped: true } };
  // Zelfs als de agent nog "streaming" meldt: gestopt = offline.
  const status = { tables: [{ tableNumber: 1, streaming: true }] };
  const res = buildLiveTables([1], store, status);
  assert.strictEqual(res[0].status, 'offline');
  assert.strictEqual(res[0].videoId, null);
  assert.strictEqual(res[0].title, null);
});

test('buildSchedule geeft aankomende enkeldaagse toernooien binnen het venster', () => {
  const planning = [
    { tournamentId: 1, name: 'Fluke', type: 'tournament', enabled: true, plannedStart: '2026-07-14T17:30:00Z', tafels: [1, 3] },
    { tournamentId: 2, name: 'Uit', type: 'tournament', enabled: false, plannedStart: '2026-07-14T17:30:00Z', tafels: [1] },
    { tournamentId: 3, name: 'League', type: 'competition', enabled: true, plannedStart: '2026-06-16T12:00:00Z', tafels: [1] },
    { tournamentId: 4, name: 'Ver weg', type: 'tournament', enabled: true, plannedStart: '2026-09-01T17:30:00Z', tafels: [1] },
  ];
  const items = buildSchedule(planning, new Date('2026-07-14T08:00:00Z'), 7);
  assert.strictEqual(items.length, 1); // alleen #1 (enabled, tournament, binnen venster)
  assert.strictEqual(items[0].tournamentName, 'Fluke');
  assert.strictEqual(items[0].startTime, '19:30'); // 17:30Z → 19:30 Amsterdam
  assert.deepStrictEqual(items[0].tableNumbers, [1, 3]);
});
