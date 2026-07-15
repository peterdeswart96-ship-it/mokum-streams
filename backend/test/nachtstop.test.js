const test = require('node:test');
const assert = require('node:assert');
const { isNachtVenster, teStoppenNachts } = require('../src/planning/nachtstop');

test('isNachtVenster: waar in [02:00, 08:00), onwaar erbuiten', () => {
  assert.strictEqual(isNachtVenster(120), true); // 02:00
  assert.strictEqual(isNachtVenster(300), true); // 05:00
  assert.strictEqual(isNachtVenster(479), true); // 07:59
  assert.strictEqual(isNachtVenster(119), false); // 01:59 (net voor sluiting)
  assert.strictEqual(isNachtVenster(480), false); // 08:00 (ochtendgrens)
  assert.strictEqual(isNachtVenster(1290), false); // 21:30 (avond — niet stoppen!)
});

test('isNachtVenster: aanpasbare grenzen', () => {
  assert.strictEqual(isNachtVenster(90, { sluiting: 90, ochtend: 300 }), true); // 01:30
  assert.strictEqual(isNachtVenster(89, { sluiting: 90, ochtend: 300 }), false);
});

test('teStoppenNachts: niet-gestopte entries, ÓÓK adhoc; slaat gestopte over', () => {
  const store = {
    1: { tableNumber: 1 },
    3: { tableNumber: 3, adhoc: true }, // handmatig → moet óók gestopt worden
    15: { tableNumber: 15, stopped: true }, // al gestopt → overslaan
  };
  assert.deepStrictEqual(teStoppenNachts(store).sort((a, b) => a - b), [1, 3]);
  assert.deepStrictEqual(teStoppenNachts({}), []);
  assert.deepStrictEqual(teStoppenNachts(null), []);
});
