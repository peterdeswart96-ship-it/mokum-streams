const test = require('node:test');
const assert = require('node:assert');
const { runOnce, rotatieZichtbaar, isDrukkeTijd, isActieveRonde } = require('../src/agent');

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

  const resultaat = await runOnce(config, pool, backend, { log() {} });

  assert.deepStrictEqual(pool.calls, [
    ['start', 1],
    ['overlay', 1, 'cs score', true],
  ]);
  // c3 was ongeldig → gedropt (wél bevestigd, zodat 'ie niet eeuwig herproberd wordt), niet uitgevoerd
  assert.deepStrictEqual(posted.verwerkteCommandoIds, ['c1', 'c2', 'c3']);
  assert.strictEqual(posted.tables[0].tableNumber, 1);
  assert.strictEqual(posted.tables[0].bitrateKbps, 5000);
  // De retourwaarde bevat verwerkteCommandoIds ook (28-08, isActieveRonde in startLoop
  // leunt hierop om na een net verwerkt commando niet terug te vallen op traag pollen).
  assert.deepStrictEqual(resultaat.verwerkteCommandoIds, ['c1', 'c2', 'c3']);
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

// 26-08: een OBS-instantie die druk is met een verse RTMP-verbinding kan traag reageren
// op status-calls. Bij een sequentiële loop trekt dát ALLE tafels met zich mee stil —
// precies wat er die avond gebeurde. Tafels moeten dus parallel verwerkt worden: de
// totale doorlooptijd hoort bij de traagste tafel te liggen, niet bij de SOM van alle
// tafels (wat een sequentiële loop zou opleveren).
test('runOnce verwerkt tafels parallel — een trage tafel vertraagt de andere niet', async () => {
  const pool = fakePool();
  const VERTRAGING_MS = 150;
  pool.status = async (t) => {
    if (t === 1) await new Promise((r) => setTimeout(r, VERTRAGING_MS));
    return { obsConnected: true, streaming: true, bitrateKbps: 5000 };
  };
  let posted = null;
  const backend = {
    async fetchCommands() { return []; },
    async postStatus(_cfg, body) { posted = body; },
  };
  const config = { tables: [{ tableNumber: 1 }, { tableNumber: 2 }, { tableNumber: 3 }] };

  const start = Date.now();
  await runOnce(config, pool, backend, { log() {} });
  const duur = Date.now() - start;

  // Sequentieel zou dit ruim over VERTRAGING_MS uitkomen (3x zoveel calls, de trage zit
  // er middenin); parallel blijft de totale duur in de buurt van de ENE trage aanroep.
  assert.ok(duur < VERTRAGING_MS * 2, `duurde ${duur}ms, verwacht ruim onder ${VERTRAGING_MS * 2}ms`);
  assert.strictEqual(posted.tables.length, 3);
  assert.deepStrictEqual(posted.tables.map((t) => t.tableNumber), [1, 2, 3]); // volgorde blijft behouden
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

// Alle momenten hieronder in augustus (CEST, UTC+2) om DST buiten beschouwing te laten.
// Donderdag 20-08-2026, zaterdag 22-08, zondag 23-08, maandag 24-08.
test('isDrukkeTijd: doordeweeks binnen 18:00-01:30 (+marge) is druk, overdag niet', () => {
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 20, 17, 0)), true);  // do 19:00 lokaal
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 20, 13, 0)), false); // do 15:00 lokaal
});

test('isDrukkeTijd: doordeweekse marge laat een uitlopende avond niet abrupt stoppen', () => {
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 19, 23, 45)), true);  // do 01:45 lokaal, binnen marge tot 02:00
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 20, 0, 30)), false); // do 02:30 lokaal, na de marge
});

test('isDrukkeTijd: weekend binnen 12:00-02:30 (+marge) is druk, ochtend niet', () => {
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 22, 11, 0)), true);  // za 13:00 lokaal
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 22, 6, 0)), false);  // za 08:00 lokaal
});

test('isDrukkeTijd: zaal-dag over middernacht — zondagavond loopt door tot in maandagochtend', () => {
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 23, 0, 0)), true);  // zo 02:00 lokaal (za-avond loopt door)
  assert.strictEqual(isDrukkeTijd(Date.UTC(2026, 7, 24, 2, 0)), false); // ma 04:00 lokaal, ruim na de marge
});

// 28-08: zonder deze uitbreiding kon de agent buiten bedrijfstijd, vlak nadat hij een
// startStream-commando verwerkte, alsnog terugvallen op het trage 60s-ritme — precies
// terwijl een verse start nog 1-3 min. YouTube-opwarmtijd nodig kan hebben (#114) en de
// agent juist snel had moeten blijven controleren.
test('isActieveRonde: streamt een tafel → actief', () => {
  assert.strictEqual(isActieveRonde([{ tableNumber: 1, streaming: true }], []), true);
});

test('isActieveRonde: niets streamt, maar er zijn net commando\'s verwerkt → toch actief', () => {
  assert.strictEqual(isActieveRonde([{ tableNumber: 1, streaming: false }], ['c1']), true);
});

test('isActieveRonde: niets streamt en niets verwerkt → niet actief (mag traag pollen)', () => {
  assert.strictEqual(isActieveRonde([{ tableNumber: 1, streaming: false }], []), false);
  assert.strictEqual(isActieveRonde([], []), false);
});

test('isActieveRonde: ontbrekende/undefined invoer valt veilig terug op niet-actief', () => {
  assert.strictEqual(isActieveRonde(undefined, undefined), false);
  assert.strictEqual(isActieveRonde(null, null), false);
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

test('runOnce: freeze-watchdog aan → bij "hersteld" komt cameraFrozen/Recovered in de status', async () => {
  const pool = fakePool();
  pool.status = async () => ({ obsConnected: true, streaming: true, bitrateKbps: 6000 });
  let called = null;
  pool.cameraWatchdog = async (t, cam) => { called = { t, cam }; return { status: 'hersteld', reden: 'bevroren beeld (twee identieke frames)' }; };
  let posted = null;
  const backend = { async fetchCommands() { return []; }, async postStatus(_c, b) { posted = b; } };
  const config = { tables: [{ tableNumber: 1, cameraSource: 'Camera Tafel 1' }], cameraWatchdog: { intervalMs: 30000 } };

  await runOnce(config, pool, backend, { log() {} });

  assert.deepStrictEqual(called, { t: 1, cam: 'Camera Tafel 1' });
  assert.strictEqual(posted.tables[0].cameraFrozen, true);
  assert.strictEqual(posted.tables[0].cameraRecovered, true);
});

test('runOnce: freeze-watchdog UIT (geen config) → cameraWatchdog niet aangeroepen', async () => {
  const pool = fakePool();
  pool.status = async () => ({ obsConnected: true, streaming: true, bitrateKbps: 6000 });
  let called = false;
  pool.cameraWatchdog = async () => { called = true; return { status: 'ok' }; };
  const backend = { async fetchCommands() { return []; }, async postStatus() {} };
  const config = { tables: [{ tableNumber: 1 }] }; // geen cameraWatchdog

  await runOnce(config, pool, backend, { log() {} });
  assert.strictEqual(called, false);
});

test('runOnce: freeze-watchdog draait niet op een NIET-streamende tafel', async () => {
  const pool = fakePool();
  pool.status = async () => ({ obsConnected: true, streaming: false, bitrateKbps: 0 });
  let called = false;
  pool.cameraWatchdog = async () => { called = true; return { status: 'ok' }; };
  const backend = { async fetchCommands() { return []; }, async postStatus() {} };
  const config = { tables: [{ tableNumber: 1 }], cameraWatchdog: true };

  await runOnce(config, pool, backend, { log() {} });
  assert.strictEqual(called, false); // niet streamend → geen watchdog
});

test('runOnce: refreshSource-commando → pool.refreshSource', async () => {
  const pool = fakePool();
  pool.refreshSource = async (t, s) => { pool.calls.push(['refresh', t, s]); };
  const backend = {
    async fetchCommands() { return [{ id: 'r1', type: 'refreshSource', tableNumber: 1, sourceName: 'Scoreboard' }]; },
    async postStatus() {},
  };
  const config = { tables: [{ tableNumber: 1 }], backendUrl: 'x', agentToken: 'y' };
  await runOnce(config, pool, backend, { log() {} });
  assert.deepStrictEqual(pool.calls, [['refresh', 1, 'Scoreboard']]);
});
