const test = require('node:test');
const assert = require('node:assert');
const { valideerCommando } = require('../src/commands');

test('valideerCommando accepteert geldige commando types', () => {
  assert.ok(valideerCommando({ type: 'startStream', tableNumber: 1 }));
  assert.ok(valideerCommando({ type: 'stopStream', tableNumber: 3 }));
  assert.ok(valideerCommando({ type: 'setOverlay', tableNumber: 1, sourceName: 'cs score', enabled: true }));
});

test('valideerCommando weigert onbekend type', () => {
  assert.throws(() => valideerCommando({ type: 'onzin', tableNumber: 1 }), /onbekend commandotype/);
});

test('valideerCommando eist een geheel tableNumber', () => {
  assert.throws(() => valideerCommando({ type: 'startStream' }), /tableNumber/);
  assert.throws(() => valideerCommando({ type: 'startStream', tableNumber: '1' }), /tableNumber/);
});

test('setOverlay eist sourceName en boolean enabled', () => {
  assert.throws(() => valideerCommando({ type: 'setOverlay', tableNumber: 1, enabled: true }), /sourceName/);
  assert.throws(() => valideerCommando({ type: 'setOverlay', tableNumber: 1, sourceName: 'x' }), /enabled/);
});

test('valideerCommando: refreshSource vereist sourceName', () => {
  assert.deepStrictEqual(valideerCommando({ type: 'refreshSource', tableNumber: 1, sourceName: 'Scoreboard' }).type, 'refreshSource');
  assert.throws(() => valideerCommando({ type: 'refreshSource', tableNumber: 1 }), /sourceName/);
});
