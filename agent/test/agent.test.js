const test = require('node:test');
const assert = require('node:assert');
const { runOnce, rotatieZichtbaar } = require('../src/agent');

// Fake OBS-pool die de aanroepen registreert i.p.v. echt OBS aan te spreken.
function fakePool() {
  const calls = [];
  return {
    calls,
    async startStream(t) { calls.push(['start', t]); },
    async stopStream(t) { calls.push(['stop', t]); },
    async setOverlay(t, s, e) { calls.push(['overlay', t, s, e]); },
    async status() { return { obsConnected: true, streaming: true, bitrateKbps: 5000 }; },
  };
}

test('runOnce voert geldige commando uit en bevestigt alleen die', async () => {
  const pool = fakePool();
  let posted = null;
  const backend = {
    async fetchCommands() {
      return [
        { id: 'c1', type: 'startStream', tableNumber: 1 },
        { id: 'c2', type: 'setOverlay', tableNumber: 1, sourceName: 'cs score', enabled: true },
        { id: 'c3', type: 'onzin', tableNumber: 1 },
      ];
    },
    async postStatus(_cfg, body) { posted = body; },
  };
  const config = { tables: [{ tableNumber: 1 }], backendUrl: 'x', agentToken: 'y' };

  await runOnce(config, pool, backend, { log() {} });

  assert.deepStrictEqual(pool.calls, [
    ['start', 1],
    ['overlay', 1, 'cs score', true],
  ]);
  // c3 was ongeldig → gedropt (wél bevestigd, zodat 'ie niet eeuwig herproberd wordt), niet uitgevoerd
  assert.deepStrictEqual(posted.verwerkteCommandoIds, ['c1', 'c2', 'c3']);
  assert.strictEqual(posted.tables[0].tableNumber, 1);
  assert.strictEqual(posted.tables[0].bitrateKbps, 5000);
});

test('runOnce slaat een commando voor een niet-beheerde tafel over en bevestigt het', async () => {
  const pool = fakePool();
  let posted = null;
  const backend = {
    async fetchCommands() {
      return [
        { id: 'a1', type: 'startStream', tableNumber: 1 },   // beheerd
        { id: 'a2', type: 'startStream', tableNumber: 99 },  // niet in config
      ];
    },
    async postStatus(_cfg, body) { posted = body; },
  };
  const config = { tables: [{ tableNumber: 1 }], backendUrl: 'x', agentToken: 'y' };

  await runOnce(config, pool, backend, { log() {} });

  assert.deepStrictEqual(pool.calls, [['start', 1]]);                 // 99 niet uitgevoerd
  assert.deepStrictEqual(posted.verwerkteCommandoIds, ['a1', 'a2']);  // beide bevestigd (skip = ack)
});

test('runOnce voegt overlay-standen + resolutie/fps toe voor een streamende tafel', async () => {
  const pool = fakePool();
  pool.status = async () => ({ obsConnected: true, streaming: true, bitrateKbps: 9000, resolution: '1920x1080', fps: 60 });
  pool.overlayStates = async () => ({ sponsors: true, scoreboard: false, scoresOtherTables: true, cuescoreLogo: true });
  let posted = null;
  const backend = {
    async fetchCommands() { return []; },
    async postStatus(_cfg, body) { posted = body; },
  };
  await runOnce({ tables: [{ tableNumber: 16 }] }, pool, backend, { log() {} });

  const t = posted.tables[0];
  assert.strictEqual(t.resolution, '1920x1080');
  assert.strictEqual(t.fps, 60);
  assert.deepStrictEqual(t.overlays, { sponsors: true, scoreboard: false, scoresOtherTables: true, cuescoreLogo: true });
});

test('runOnce leest geen overlays uit als de tafel niet streamt', async () => {
  const pool = fakePool();
  pool.status = async () => ({ obsConnected: true, streaming: false, bitrateKbps: 0, resolution: '1920x1080', fps: 60 });
  let overlayCalls = 0;
  pool.overlayStates = async () => { overlayCalls++; return {}; };
  let posted = null;
  const backend = { async fetchCommands() { return []; }, async postStatus(_c, b) { posted = b; } };

  await runOnce({ tables: [{ tableNumber: 16 }] }, pool, backend, { log() {} });

  assert.strictEqual(overlayCalls, 0); // niet uitgelezen wanneer offline/idle
  assert.strictEqual(posted.tables[0].overlays, undefined);
});

test('runOnce rapporteert een tafel als offline als de status faalt', async () => {
  const pool = fakePool();
  pool.status = async () => { throw new Error('geen OBS'); };
  let posted = null;
  const backend = {
    async fetchCommands() { return []; },
    async postStatus(_cfg, body) { posted = body; },
  };
  const config = { tables: [{ tableNumber: 3 }], backendUrl: 'x', agentToken: 'y' };

  await runOnce(config, pool, backend, { log() {} });

  assert.deepStrictEqual(posted.tables, [
    { tableNumber: 3, obsConnected: false, streaming: false, bitrateKbps: 0 },
  ]);
});

test('rotatieZichtbaar: aan tijdens de eerste forSec, daarna uit tot de volgende cyclus', () => {
  const r = { key: 'scoresOtherTables', everySec: 180, forSec: 20 };
  assert.strictEqual(rotatieZichtbaar(r, 0), true);        // begin cyclus
  assert.strictEqual(rotatieZichtbaar(r, 19_000), true);   // nog binnen de 20s
  assert.strictEqual(rotatieZichtbaar(r, 20_000), false);  // net erna
  assert.strictEqual(rotatieZichtbaar(r, 179_000), false); // eind cyclus
  assert.strictEqual(rotatieZichtbaar(r, 180_000), true);  // volgende cyclus begint
});

test('rotatieZichtbaar: onvolledige/nul-config → altijd uit', () => {
  assert.strictEqual(rotatieZichtbaar({ everySec: 0, forSec: 20 }, 5_000), false);
  assert.strictEqual(rotatieZichtbaar({ everySec: 180 }, 5_000), false);
  assert.strictEqual(rotatieZichtbaar({}, 5_000), false);
});

test('runOnce zet een rotatie-overlay aan wanneer die zichtbaar hoort te zijn', async () => {
  const pool = fakePool();
  pool.status = async () => ({ obsConnected: true, streaming: true, bitrateKbps: 9000 });
  pool.overlayStates = async () => ({ scoresOtherTables: false }); // staat nu uit
  let posted = null;
  const backend = { async fetchCommands() { return []; }, async postStatus(_c, b) { posted = b; } };
  const config = {
    tables: [{ tableNumber: 3 }],
    overlaySources: { scoresOtherTables: 'Scores other tables' },
    rotations: [{ key: 'scoresOtherTables', everySec: 180, forSec: 20 }],
  };
  await runOnce(config, pool, backend, { log() {} }, 0); // nowMs=0 → binnen forSec → moet aan

  assert.deepStrictEqual(pool.calls, [['overlay', 3, 'Scores other tables', true]]);
  assert.strictEqual(posted.tables[0].overlays.scoresOtherTables, true); // gerapporteerde stand bijgewerkt
});

test('runOnce laat een rotatie-overlay met rust als de stand al klopt', async () => {
  const pool = fakePool();
  pool.status = async () => ({ obsConnected: true, streaming: true, bitrateKbps: 9000 });
  pool.overlayStates = async () => ({ scoresOtherTables: false }); // al uit
  const backend = { async fetchCommands() { return []; }, async postStatus() {} };
  const config = {
    tables: [{ tableNumber: 3 }],
    overlaySources: { scoresOtherTables: 'Scores other tables' },
    rotations: [{ key: 'scoresOtherTables', everySec: 180, forSec: 20 }],
  };
  await runOnce(config, pool, backend, { log() {} }, 50_000); // buiten forSec → wil uit; is al uit

  assert.deepStrictEqual(pool.calls, []); // geen overbodige OBS-call
});

test('runOnce: auto-start (preflight) met een BEVROREN camera → niet starten, niet bevestigen, alarm in status', async () => {
  const pool = fakePool();
  pool.cameraLevendig = async () => ({ live: false, reden: 'bevroren beeld (twee identieke frames)' });
  pool.status = async () => ({ obsConnected: true, streaming: false, bitrateKbps: 0 });
  let posted = null;
  const backend = {
    async fetchCommands() { return [{ id: 'p1', type: 'startStream', tableNumber: 1, preflight: true }]; },
    async postStatus(_c, body) { posted = body; },
  };
  const config = { tables: [{ tableNumber: 1, cameraSource: 'Camera Tafel 1' }], backendUrl: 'x', agentToken: 'y' };

  await runOnce(config, pool, backend, { log() {} });

  assert.deepStrictEqual(pool.calls, []); // OBS NIET gestart
  assert.deepStrictEqual(posted.verwerkteCommandoIds, []); // niet bevestigd → volgende tik opnieuw
  assert.strictEqual(posted.tables[0].preflightFailed, true);
  assert.match(posted.tables[0].preflightReason, /bevroren/i);
});

test('runOnce: auto-start (preflight) met een LIVE camera → gewoon starten', async () => {
  const pool = fakePool();
  pool.cameraLevendig = async () => ({ live: true, reden: 'beeld wisselt (live)' });
  const backend = {
    async fetchCommands() { return [{ id: 'p2', type: 'startStream', tableNumber: 1, preflight: true }]; },
    async postStatus() {},
  };
  const config = { tables: [{ tableNumber: 1 }], backendUrl: 'x', agentToken: 'y' };

  await runOnce(config, pool, backend, { log() {} });

  assert.deepStrictEqual(pool.calls, [['start', 1]]); // wél gestart
});

test('runOnce: HANDMATIGE start (geen preflight-vlag) slaat de cameracheck over', async () => {
  const pool = fakePool();
  let checked = false;
  pool.cameraLevendig = async () => { checked = true; return { live: false, reden: 'x' }; };
  const backend = {
    async fetchCommands() { return [{ id: 'm1', type: 'startStream', tableNumber: 1 }]; }, // geen preflight
    async postStatus() {},
  };
  const config = { tables: [{ tableNumber: 1 }], backendUrl: 'x', agentToken: 'y' };

  await runOnce(config, pool, backend, { log() {} });

  assert.strictEqual(checked, false); // cameraLevendig niet aangeroepen
  assert.deepStrictEqual(pool.calls, [['start', 1]]); // gewoon gestart
});
