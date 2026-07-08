const test = require('node:test');
const assert = require('node:assert');
const { normalizeConfig } = require('../src/config');

test('normalizeConfig vult defaults per OBS-instantie', () => {
  const c = normalizeConfig({
    backendUrl: 'https://x.azurewebsites.net/',
    tables: [{ tableNumber: 1, obs: { password: 'p' } }],
  });
  assert.strictEqual(c.backendUrl, 'https://x.azurewebsites.net'); // trailing slash weg
  assert.strictEqual(c.tables[0].obs.host, '127.0.0.1');
  assert.strictEqual(c.tables[0].obs.port, 4455);
  assert.strictEqual(c.tables[0].sceneName, null);
  assert.strictEqual(c.pollIntervalMs, 5000);
});

test('normalizeConfig eist backendUrl en minstens één tafel', () => {
  assert.throws(() => normalizeConfig({ tables: [{ tableNumber: 1 }] }), /backendUrl/);
  assert.throws(() => normalizeConfig({ backendUrl: 'x', tables: [] }), /minstens één tafel/);
});

test('normalizeConfig weigert een tafel zonder geldig tableNumber', () => {
  assert.throws(
    () => normalizeConfig({ backendUrl: 'x', tables: [{ sceneName: 'Scène' }] }),
    /tableNumber/
  );
});
