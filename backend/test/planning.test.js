const test = require('node:test');
const assert = require('node:assert');
const { defaultRecord, mergePlanning } = require('../src/planning/planning');

test('defaultRecord past de standaard-instellingen toe (alles aan)', () => {
  const r = defaultRecord({
    id: 1,
    name: 'Fluke ranking',
    start: '2026-07-14T17:30:00Z',
    stop: '2026-07-14T21:00:00Z',
  });
  assert.strictEqual(r.enabled, true);
  assert.deepStrictEqual(r.tafels, [1, 3, 15, 16]);
  assert.deepStrictEqual(r.overlays, { sponsors: true, scoreboard: true });
  assert.strictEqual(r.preRollMinuten, 10);
  assert.strictEqual(r.date, '2026-07-14');
  assert.strictEqual(r.source, 'cuescore');
  assert.strictEqual(r.plannedStart, '2026-07-14T17:30:00Z');
});

test('mergePlanning behoudt handmatige keuzes en ververst Cuescore-velden', () => {
  const bestaand = [
    {
      tournamentId: 1,
      name: 'Oude naam',
      enabled: false,
      tafels: [1],
      overlays: { sponsors: false, scoreboard: true },
      preRollMinuten: 5,
      startOverride: '2026-07-14T18:00:00Z',
      stopOverride: null,
      source: 'cuescore',
      plannedStart: null,
      plannedStop: null,
    },
    { tournamentId: 'adhoc-x', name: 'Handmatig', source: 'adhoc', tafels: [15] },
  ];
  const imported = [
    { id: 1, name: 'Fluke ranking #22', start: '2026-07-14T17:30:00Z', stop: null },
    { id: 2, name: 'Nieuw toernooi', start: '2026-07-15T18:00:00Z', stop: null },
  ];

  const merged = mergePlanning(bestaand, imported);

  const r1 = merged.find((r) => String(r.tournamentId) === '1');
  assert.strictEqual(r1.enabled, false); // override behouden
  assert.deepStrictEqual(r1.tafels, [1]); // override behouden
  assert.strictEqual(r1.startOverride, '2026-07-14T18:00:00Z');
  assert.strictEqual(r1.name, 'Fluke ranking #22'); // Cuescore ververst
  assert.strictEqual(r1.plannedStart, '2026-07-14T17:30:00Z');

  const r2 = merged.find((r) => String(r.tournamentId) === '2');
  assert.strictEqual(r2.enabled, true); // nieuw → standaard aan
  assert.deepStrictEqual(r2.tafels, [1, 3, 15, 16]);

  const adhoc = merged.find((r) => r.tournamentId === 'adhoc-x');
  assert.ok(adhoc, 'ad-hoc record blijft behouden');
});
