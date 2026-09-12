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
  assert.deepStrictEqual(r.tafels, [1, 3]); // standaard alleen de twee vaste cameratafels
  // Jumbotron staat sinds #93 standaard AAN: een avond begint met het pauzescherm en de
  // highlights, en dat gaat vanzelf uit zodra er op die tafel gespeeld wordt.
  assert.deepStrictEqual(r.overlays, { sponsors: true, scoreboard: true, jumbotron: true });
  // Weer terug naar tien minuten sinds 12-09 (was vijf sinds 05-08) — meer marge om een
  // storing op te lossen vóór de eerste bal valt. Per toernooi aan te passen in de planner.
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
  assert.deepStrictEqual(r2.tafels, [1, 3]); // standaard alleen de twee vaste cameratafels

  const adhoc = merged.find((r) => r.tournamentId === 'adhoc-x');
  assert.ok(adhoc, 'ad-hoc record blijft behouden');
});

test('mergePlanning: een niet meer gezien ID met dezelfde naam+datum als een nieuw ID wordt vervangen, geen dubbelganger (incident 09-09/10-09)', () => {
  const bestaand = [
    {
      tournamentId: 88433578, // het "oude" ID, niet meer in de Cuescore-import
      name: 'Mokum MEGA Winter Ranking #3',
      date: '2026-09-09',
      enabled: true,
      planned: true, // Peter had 'm expliciet ingepland
      tafels: [1, 3],
      overlays: { sponsors: true, scoreboard: true, jumbotron: true },
      preRollMinuten: 5,
      startOverride: '2026-09-09T17:15:00.000Z',
      stopOverride: '2026-09-10T00:30:00.000Z',
      visibility: 'public',
      source: 'cuescore',
      plannedStart: '2026-09-09T17:15:00Z',
      plannedStop: '2026-09-09T21:59:00Z',
    },
  ];
  const imported = [
    { id: 88435582, name: 'Mokum MEGA Winter Ranking #3', start: '2026-09-09T17:15:00Z', stop: '2026-09-09T21:59:00Z' },
  ];

  const merged = mergePlanning(bestaand, imported);

  assert.strictEqual(merged.length, 1, 'geen dubbelganger — het oude record blijft niet naast het nieuwe staan');
  const r = merged[0];
  assert.strictEqual(r.tournamentId, 88435582); // het NIEUWE Cuescore-ID
  assert.strictEqual(r.planned, true); // handmatige keuze overgenomen
  assert.deepStrictEqual(r.tafels, [1, 3]);
  assert.strictEqual(r.startOverride, '2026-09-09T17:15:00.000Z'); // override overgenomen
});

test('mergePlanning: een verweesd record zonder naam/datum-match blijft gewoon los staan (geen valse match)', () => {
  const bestaand = [
    { tournamentId: 111, name: 'Fluke ranking', date: '2026-09-01', enabled: true, tafels: [1, 3] },
  ];
  const imported = [
    { id: 222, name: 'Een heel ander toernooi', start: '2026-09-08T18:00:00Z', stop: null },
  ];

  const merged = mergePlanning(bestaand, imported);

  assert.strictEqual(merged.length, 2); // geen naam/datum-match → allebei blijven bestaan
  assert.ok(merged.find((r) => r.tournamentId === 111));
  assert.ok(merged.find((r) => r.tournamentId === 222));
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
