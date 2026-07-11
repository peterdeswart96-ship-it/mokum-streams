const test = require('node:test');
const assert = require('node:assert');
const { runOnce } = require('../src/agent');

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
