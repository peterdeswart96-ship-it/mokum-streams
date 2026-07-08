const test = require('node:test');
const assert = require('node:assert');
const { removeProcessed, enqueue, isTableBusy } = require('../src/agent/commandQueue');

test('removeProcessed haalt bevestigde commando-ids uit de wachtrij', () => {
  const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepStrictEqual(removeProcessed(q, ['a', 'c']).map((c) => c.id), ['b']);
  assert.deepStrictEqual(removeProcessed(q, []).map((c) => c.id), ['a', 'b', 'c']);
  assert.deepStrictEqual(removeProcessed([], ['x']), []);
});

test('enqueue voegt een of meerdere commandos achteraan toe', () => {
  assert.deepStrictEqual(enqueue([{ id: 'a' }], { id: 'b' }).map((c) => c.id), ['a', 'b']);
  assert.deepStrictEqual(enqueue([], [{ id: 'x' }, { id: 'y' }]).map((c) => c.id), ['x', 'y']);
});

test('isTableBusy herkent een bezette tafel in de dagstore', () => {
  const store = { '1': { videoId: 'v' } };
  assert.strictEqual(isTableBusy(store, 1), true);
  assert.strictEqual(isTableBusy(store, '1'), true);
  assert.strictEqual(isTableBusy(store, 3), false);
  assert.strictEqual(isTableBusy({}, 1), false);
});
