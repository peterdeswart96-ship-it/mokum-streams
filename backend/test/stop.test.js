const test = require('node:test');
const assert = require('node:assert');
const { shouldStop } = require('../src/planning/stop');

const NOW = new Date('2026-07-14T21:00:00Z');

test('shouldStop: enkeldaags toernooi stopt als het Finished is', () => {
  const entry = { tableNumber: 1, tournamentId: 1 };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, { finished: true }, NOW), true);
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, { finished: false }, NOW), false);
});

test('shouldStop: enkeldaags toernooi stopt op de eind-tijd (vangnet), ook zonder Cuescore-data', () => {
  const entry = { tableNumber: 1, tournamentId: 1 };
  // plannedStop in het verleden → stoppen, óók als Cuescore onbereikbaar is (tournament = null)
  assert.strictEqual(shouldStop(entry, { type: 'tournament', plannedStop: '2026-07-14T20:59:00Z' }, null, NOW), true);
  // plannedStop in de toekomst + nog niet finished → nog niet stoppen
  assert.strictEqual(shouldStop(entry, { type: 'tournament', plannedStop: '2026-07-14T23:00:00Z' }, { finished: false }, NOW), false);
});

test('shouldStop: ad-hoc en al gestopte streams stoppen nooit automatisch', () => {
  assert.strictEqual(shouldStop({ tableNumber: 1, adhoc: true }, {}, { finished: true }, NOW), false);
  assert.strictEqual(shouldStop({ tableNumber: 1, stopped: true }, {}, { finished: true }, NOW), false);
});

test('shouldStop: stopOverride bereikt → stoppen (ongeacht Cuescore)', () => {
  const entry = { tableNumber: 1, tournamentId: 1 };
  assert.strictEqual(shouldStop(entry, { stopOverride: '2026-07-14T20:00:00Z' }, { finished: false }, NOW), true);
  assert.strictEqual(shouldStop(entry, { stopOverride: '2026-07-14T22:00:00Z' }, { finished: false }, NOW), false);
});

test('shouldStop: competitie stopt als er vandaag geen niet-afgeronde wedstrijd meer op de tafel is', () => {
  const entry = { tableNumber: 1, tournamentId: 9 };
  const record = { type: 'competition', tafels: [1] };
  const alleKlaar = { matches: [{ table: '1', start: '2026-07-14T18:00:00Z', status: 'finished' }] };
  const nogBezig = { matches: [{ table: '1', start: '2026-07-14T20:30:00Z', status: 'scheduled' }] };
  assert.strictEqual(shouldStop(entry, record, alleKlaar, NOW), true);
  assert.strictEqual(shouldStop(entry, record, nogBezig, NOW), false);
});

test('shouldStop: enkeldaags stopt als de finale gespeeld is en de tafel geen wedstrijd meer heeft', () => {
  const NOW2 = new Date('2026-07-14T22:00:00Z');
  const entry = { tableNumber: 1 };
  // Finale klaar, en op tafel 1 staat geen niet-afgeronde wedstrijd meer vandaag.
  const tFinaleKlaar = { finished: false, matches: [
    { table: '1', start: '2026-07-14T20:00:00Z', status: 'finished', roundName: 'Final' },
  ] };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, tFinaleKlaar, NOW2), true);

  // Finale klaar, maar tafel 1 heeft nog een niet-afgeronde wedstrijd (bijv. brons) → NIET stoppen.
  const tBronsLoopt = { finished: false, matches: [
    { table: '1', start: '2026-07-14T20:00:00Z', status: 'finished', roundName: 'Final' },
    { table: '1', start: '2026-07-14T22:30:00Z', status: 'scheduled', roundName: '3rd place' },
  ] };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, tBronsLoopt, NOW2), false);

  // Finale nog niet gespeeld, geen plannedStop → nog niet stoppen.
  const tGeenFinale = { finished: false, matches: [
    { table: '1', start: '2026-07-14T20:00:00Z', status: 'finished', roundName: 'Halve finale' },
  ] };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, tGeenFinale, NOW2), false);
});
