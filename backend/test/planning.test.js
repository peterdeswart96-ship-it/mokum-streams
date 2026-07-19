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

test('planningStatus: concept / gepland / live / klaar / geannuleerd', () => {
  const { planningStatus } = require('../src/planning/planning');
  const vandaag = '2026-07-19';
  const rec = (o) => ({ tournamentId: 't1', planned: true, plannedStart: '2026-07-19T18:00:00Z', ...o });

  // concept
  assert.strictEqual(planningStatus(rec({ planned: false }), {}, vandaag), 'concept');
  // geannuleerd wint
  assert.strictEqual(planningStatus(rec({ geannuleerd: true }), {}, vandaag), 'geannuleerd');
  // gepland (ingepland, nog geen broadcast, vandaag/toekomst)
  assert.strictEqual(planningStatus(rec({}), {}, vandaag), 'gepland');
  // live: een niet-gestopte broadcast van dit toernooi in de dag-store
  const storeLive = { 1: { tournamentId: 't1', stopped: false }, 3: { tournamentId: 't1', stopped: true } };
  assert.strictEqual(planningStatus(rec({}), storeLive, vandaag), 'live');
  // klaar: broadcasts bestonden maar allemaal gestopt
  const storeKlaar = { 1: { tournamentId: 't1', stopped: true } };
  assert.strictEqual(planningStatus(rec({}), storeKlaar, vandaag), 'klaar');
  // klaar: dag voorbij, geen broadcasts (meer) in de store van vandaag
  assert.strictEqual(planningStatus(rec({ plannedStart: '2026-07-18T18:00:00Z' }), {}, vandaag), 'klaar');
  // broadcast van een ánder toernooi telt niet mee
  assert.strictEqual(planningStatus(rec({}), { 1: { tournamentId: 'anders', stopped: false } }, vandaag), 'gepland');
});
