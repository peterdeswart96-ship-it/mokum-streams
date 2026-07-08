const test = require('node:test');
const assert = require('node:assert');
const { streamTitle, planLiveStreamSeed } = require('../src/setup/seed');

test('streamTitle geeft een vaste titel per tafel', () => {
  assert.strictEqual(streamTitle(15), 'Mokum Streams — Tafel 15');
});

test('planLiveStreamSeed hergebruikt bestaande streams op titel en maakt de rest', () => {
  const existing = [
    { id: 'S1', title: 'Mokum Streams — Tafel 1' },
    { id: 'S15', title: 'Mokum Streams — Tafel 15' },
    { id: 'X', title: 'Iets anders' },
  ];
  const { reuse, teMaken } = planLiveStreamSeed(existing, [1, 3, 15, 16]);
  assert.deepStrictEqual(reuse, [
    { tableNumber: 1, streamId: 'S1' },
    { tableNumber: 15, streamId: 'S15' },
  ]);
  assert.deepStrictEqual(teMaken, [
    { tableNumber: 3, title: 'Mokum Streams — Tafel 3' },
    { tableNumber: 16, title: 'Mokum Streams — Tafel 16' },
  ]);
});

test('planLiveStreamSeed zonder bestaande streams maakt alles', () => {
  const { reuse, teMaken } = planLiveStreamSeed([], [1, 3]);
  assert.strictEqual(reuse.length, 0);
  assert.strictEqual(teMaken.length, 2);
});
