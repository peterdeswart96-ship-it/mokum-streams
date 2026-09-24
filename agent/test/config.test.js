const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, loadConfig, onbekendeVelden } = require('../src/config');

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

test('onbekendeVelden meldt velden die normalizeConfig stil zou weggooien (#152)', () => {
  const raw = {
    backendUrl: 'x',
    rotations: [],
    overlaySources: {},
    tables: [{ tableNumber: 1, obs: {}, cameraSorce: 'typfout' }],
  };
  assert.deepStrictEqual(onbekendeVelden(raw), ['rotations', 'overlaySources', 'tables[0].cameraSorce']);
});

test('onbekendeVelden: bekende velden en _commentaar geven geen melding', () => {
  const raw = {
    _uitleg: 'commentaar',
    backendUrl: 'x',
    agentToken: 't',
    pollIntervalMs: 3000,
    cameraWatchdog: null,
    tables: [{ tableNumber: 1, sceneName: null, cameraSource: 'c', obs: {} }],
  };
  assert.deepStrictEqual(onbekendeVelden(raw), []);
  assert.deepStrictEqual(onbekendeVelden(undefined), []);
});

test('de voorbeeldconfig bevat geen velden die de agent negeert', () => {
  const voorbeeld = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'agent-config.example.json'), 'utf8')
  );
  assert.deepStrictEqual(onbekendeVelden(voorbeeld), []);
});

test('loadConfig logt een waarschuwing per onbekend veld, maar laadt gewoon door', () => {
  const tmp = path.join(os.tmpdir(), `agent-config-test-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ backendUrl: 'x', rotations: [], tables: [{ tableNumber: 1 }] }));
  try {
    const regels = [];
    const c = loadConfig(tmp, { log: (m) => regels.push(m) });
    assert.strictEqual(c.tables.length, 1);
    assert.strictEqual(regels.length, 1);
    assert.match(regels[0], /\[CONFIG\] onbekend veld 'rotations'/);
  } finally {
    fs.unlinkSync(tmp);
  }
});
