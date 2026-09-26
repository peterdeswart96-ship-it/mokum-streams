const test = require('node:test');
const assert = require('node:assert');
const { refreshCommandsFor, REFRESH_SLEUTELS, OVERLAY_BRON } = require('../src/agent/commandQueue');

test('zonder bronnen: scoreboard én jumbotron per tafel (#99)', () => {
  assert.deepStrictEqual(refreshCommandsFor([15]), [
    { type: 'refreshSource', tableNumber: 15, sourceName: OVERLAY_BRON.scoreboard },
    { type: 'refreshSource', tableNumber: 15, sourceName: OVERLAY_BRON.jumbotron },
  ]);
});

test('meerdere tafels: alle bronnen voor elke tafel', () => {
  const cmds = refreshCommandsFor([1, 3, 15, 16]);
  assert.strictEqual(cmds.length, 4 * REFRESH_SLEUTELS.length);
  assert.deepStrictEqual([...new Set(cmds.map((c) => c.tableNumber))], [1, 3, 15, 16]);
});

test('één gekozen bron: alleen die', () => {
  assert.deepStrictEqual(refreshCommandsFor([3], ['jumbotron']), [
    { type: 'refreshSource', tableNumber: 3, sourceName: 'Jumbotron' },
  ]);
});

test('lege lijst bronnen telt als "standaard"', () => {
  assert.strictEqual(refreshCommandsFor([1], []).length, REFRESH_SLEUTELS.length);
});

test('bronnen die niet ververst mogen worden → fout (geen camerabron, geen sponsors)', () => {
  assert.throws(() => refreshCommandsFor([1], ['sponsors']), /mag niet ververst/);
  assert.throws(() => refreshCommandsFor([1], ['camera']), /mag niet ververst/);
});

test('tafelnummer als tekst wordt een getal (agent valideert dit als getal)', () => {
  assert.strictEqual(refreshCommandsFor(['15'])[0].tableNumber, 15);
});
