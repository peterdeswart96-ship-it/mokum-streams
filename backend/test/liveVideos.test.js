const test = require('node:test');
const assert = require('node:assert');
const { parseTafelUitTitel, koppelVideosAanTafels } = require('../src/youtube/liveVideos');
const { buildLiveTables } = require('../src/public/live');

test('parseTafelUitTitel haalt het tafelnummer uit de titel', () => {
  assert.strictEqual(parseTafelUitTitel('Tafel 3 Qualifier 4 GO Customs'), 3);
  assert.strictEqual(parseTafelUitTitel('tafel 15 iets'), 15);
  assert.strictEqual(parseTafelUitTitel('Geen tafel hier'), null);
  assert.strictEqual(parseTafelUitTitel(''), null);
});

test('koppelVideosAanTafels koppelt broadcasts (met zichtbaarheid) aan cameratafels op titel', () => {
  const broadcasts = [
    { videoId: 'aaa', title: 'Tafel 1 Toernooi X', visibility: 'public' },
    { videoId: 'bbb', title: 'Tafel 3 Toernooi X', visibility: 'unlisted' },
    { videoId: 'ccc', title: 'Tafel 99 Andere zaal' }, // niet in camera's
    { videoId: 'ddd', title: 'Zonder tafel' },
  ];
  const r = koppelVideosAanTafels(broadcasts, [1, 3, 15, 16]);
  assert.deepStrictEqual(r, {
    1: { videoId: 'aaa', visibility: 'public' },
    3: { videoId: 'bbb', visibility: 'unlisted' },
  });
});

test('koppelVideosAanTafels: eerste match per tafel wint', () => {
  const broadcasts = [
    { videoId: 'oud', title: 'Tafel 1 Eerste' },
    { videoId: 'nieuw', title: 'Tafel 1 Tweede' },
  ];
  assert.deepStrictEqual(koppelVideosAanTafels(broadcasts, [1]), { 1: { videoId: 'oud', visibility: null } });
});

test('buildLiveTables geeft liveVideoId + liveVisibility door (met compat voor de oude vorm)', () => {
  const liveVideos = { videos: { 3: { videoId: 'vid3', visibility: 'unlisted' }, 15: 'oudVid' } };
  const byT = Object.fromEntries(
    buildLiveTables([1, 3, 15], {}, { tables: [] }, {}, liveVideos).map((r) => [r.tableNumber, r])
  );
  assert.strictEqual(byT[3].liveVideoId, 'vid3');
  assert.strictEqual(byT[3].liveVisibility, 'unlisted');
  assert.strictEqual(byT[3].status, 'live'); // YouTube-broadcast zonder store-entry telt nu als live
  assert.strictEqual(byT[15].liveVideoId, 'oudVid'); // oude string-vorm blijft werken
  assert.strictEqual(byT[15].liveVisibility, null);
  assert.strictEqual(byT[1].liveVideoId, null);
});

test('buildLiveTables: live op YouTube ZONDER store-entry (bv. na middernacht-rollover) → live + stopbaar', () => {
  const liveVideos = { videos: { 1: { videoId: 'vid1', visibility: 'public' } } };
  const byT = Object.fromEntries(
    buildLiveTables([1], {}, { tables: [] }, {}, liveVideos).map((r) => [r.tableNumber, r])
  );
  assert.strictEqual(byT[1].status, 'live'); // geen store-entry, maar YouTube heeft een actieve broadcast
  assert.strictEqual(byT[1].videoId, 'vid1'); // valt terug op de YouTube-broadcast (voor Stop/Bekijk-knop)
});

test('buildLiveTables: agent meldt streaming zonder store-entry → live met kwaliteit', () => {
  const status = { tables: [{ tableNumber: 3, streaming: true, resolution: '1920x1080', fps: 30 }] };
  const byT = Object.fromEntries(
    buildLiveTables([3], {}, status, {}, {}).map((r) => [r.tableNumber, r])
  );
  assert.strictEqual(byT[3].status, 'live');
  assert.deepStrictEqual(byT[3].quality, { resolution: '1920x1080', fps: 30, bitrateKbps: null });
});

test('buildLiveTables: cameraAlarm uit de agent-status (pre-flight + freeze-watchdog)', () => {
  const status = { tables: [
    { tableNumber: 1, streaming: false, preflightFailed: true, preflightReason: 'bevroren beeld (twee identieke frames)' },
    { tableNumber: 3, streaming: true, cameraFrozen: true, cameraRecovered: true, cameraReason: 'bevroren beeld' },
    { tableNumber: 15, streaming: true }, // niks aan de hand
  ] };
  const byT = Object.fromEntries(
    buildLiveTables([1, 3, 15], {}, status, {}, {}).map((r) => [r.tableNumber, r])
  );
  assert.strictEqual(byT[1].cameraAlarm.type, 'preflight');
  assert.match(byT[1].cameraAlarm.reason, /bevroren/i);
  assert.strictEqual(byT[1].cameraAlarm.recovered, false);
  assert.strictEqual(byT[3].cameraAlarm.type, 'frozen');
  assert.strictEqual(byT[3].cameraAlarm.recovered, true);
  assert.strictEqual(byT[15].cameraAlarm, null);
});
