const test = require('node:test');
const assert = require('node:assert');
const { cameraTablesWithMatchToday, leagueDueTables } = require('../src/planning/league');

// Fixture: een league (doorlopend tournament) met wedstrijden op verschillende
// dagen/tafels. Match-velden zoals genormaliseerd (table = string, start = ISO).
const LEAGUE = {
  id: 83049058,
  name: 'Mokum 14.1 Summer league',
  type: 'competition',
  matches: [
    { matchId: 1, table: '1', start: '2026-07-14T18:00:00Z', status: 'scheduled' },
    { matchId: 2, table: '1', start: '2026-07-14T19:30:00Z', status: 'scheduled' }, // later op tafel 1
    { matchId: 3, table: '3', start: '2026-07-14T18:30:00Z', status: 'scheduled' },
    { matchId: 4, table: '15', start: '2026-07-14T18:00:00Z', status: 'finished' }, // klaar → niet meetellen
    { matchId: 5, table: '2', start: '2026-07-14T18:00:00Z', status: 'scheduled' }, // geen camera-tafel
    { matchId: 6, table: '1', start: '2026-07-15T18:00:00Z', status: 'scheduled' }, // andere dag
  ],
};

const CAMERAS = [1, 3, 15, 16];

test('cameraTablesWithMatchToday geeft camera-tafels met een wedstrijd vandaag + vroegste start', () => {
  const res = cameraTablesWithMatchToday(LEAGUE, CAMERAS, new Date('2026-07-14T12:00:00Z'));
  const byTable = Object.fromEntries(res.map((r) => [r.tableNumber, r.earliestStart]));
  assert.strictEqual(byTable[1], '2026-07-14T18:00:00Z'); // vroegste van tafel 1
  assert.strictEqual(byTable[3], '2026-07-14T18:30:00Z');
  assert.ok(!(15 in byTable), 'tafel 15 is afgerond → niet meegeteld');
  assert.ok(!(2 in byTable), 'tafel 2 is geen camera-tafel');
});

test('cameraTablesWithMatchToday negeert wedstrijden van een andere dag', () => {
  const res = cameraTablesWithMatchToday(LEAGUE, CAMERAS, new Date('2026-07-15T12:00:00Z'));
  assert.deepStrictEqual(res.map((r) => r.tableNumber).sort(), [1]); // alleen match 6 op tafel 1
});

test('leagueDueTables geeft tafels binnen het pre-roll-venster van de vroegste wedstrijd', () => {
  const record = { tafels: CAMERAS, preRollMinuten: 10 };
  // 17:52Z = 8 min voor 18:00 → tafel 1 due; tafel 3 (18:30) nog niet
  const due = leagueDueTables(LEAGUE, record, new Date('2026-07-14T17:52:00Z'));
  assert.deepStrictEqual(due.map((r) => r.tableNumber), [1]);
});

test('leagueDueTables is leeg ruim vóór de eerste wedstrijd', () => {
  const record = { tafels: CAMERAS, preRollMinuten: 10 };
  assert.deepStrictEqual(leagueDueTables(LEAGUE, record, new Date('2026-07-14T16:00:00Z')), []);
});

test('herresolveerTafels: houdt van de geplande tafels alleen die met een wedstrijd vandaag', () => {
  const { herresolveerTafels } = require('../src/planning/league');
  const now = new Date('2026-07-14T17:30:00Z');
  const tournament = { matches: [
    { matchId: 1, table: '1', start: '2026-07-14T18:00:00Z', status: 'scheduled' },
    { matchId: 2, table: '3', start: '2026-07-14T18:30:00Z', status: 'playing' },
    { matchId: 3, table: '15', start: '2026-07-14T18:00:00Z', status: 'finished' }, // klaar → weg
    { matchId: 4, table: '2', start: '2026-07-14T18:00:00Z', status: 'scheduled' },  // geen geplande tafel
  ] };
  // gepland 1,3,15,16 → 1 (gepland) + 3 (playing); 15 klaar, 16 geen wedstrijd
  assert.deepStrictEqual(herresolveerTafels(tournament, [1, 3, 15, 16], now), [1, 3]);
});

test('herresolveerTafels: playing telt mee ook zonder start-tijd', () => {
  const { herresolveerTafels } = require('../src/planning/league');
  const now = new Date('2026-07-14T20:00:00Z');
  const tournament = { matches: [{ matchId: 9, table: '16', start: null, status: 'playing' }] };
  assert.deepStrictEqual(herresolveerTafels(tournament, [1, 16], now), [16]);
});

test('herresolveerTafels: geen tafeltoewijzing (loting niet gemaakt) → geplande tafels', () => {
  const { herresolveerTafels } = require('../src/planning/league');
  const now = new Date('2026-07-14T17:30:00Z');
  assert.deepStrictEqual(herresolveerTafels({ matches: [] }, [1, 3], now), [1, 3]);
  assert.deepStrictEqual(herresolveerTafels(null, [1, 3, 15, 16], now), [1, 3, 15, 16]);
});

// --- #77: de zaal-dag loopt door tot 06:00 (incident 29-07-2026) ---
//
// Die avond begon de finale om 23:40 en liep tot 00:21. Om middernacht sloeg de
// kalenderdatum om, waarna het systeem concludeerde dat er niets meer speelde:
// jumbotron aan tijdens de halve finales, scorebord uit, geen medaillescherm.
// Tijden hier als expliciete UTC-instants (00:30 NL = 22:30Z), zodat de test niet
// afhangt van de tijdzone van de machine.

test('#77: zaalDag slaat pas om 06:00 om, niet om middernacht', () => {
  const { zaalDag } = require('../src/schedule/schedule');
  const nl = (s) => new Date(s);
  assert.strictEqual(zaalDag(nl('2026-07-29T21:00:00Z')), '2026-07-29'); // 23:00 NL
  assert.strictEqual(zaalDag(nl('2026-07-29T22:30:00Z')), '2026-07-29'); // 00:30 NL, nog dezelfde avond
  assert.strictEqual(zaalDag(nl('2026-07-30T01:59:00Z')), '2026-07-29'); // 03:59 NL, nog steeds
  assert.strictEqual(zaalDag(nl('2026-07-30T04:30:00Z')), '2026-07-30'); // 06:30 NL, nieuwe dag
  assert.strictEqual(zaalDag(nl('2026-07-30T10:00:00Z')), '2026-07-30'); // 12:00 NL
});

test('#77: een wedstrijd na middernacht telt nog mee voor de avond ervoor', () => {
  const { cameraTablesWithMatchToday } = require('../src/planning/league');
  // Halve finale gepland op 29-07 23:50 NL, wordt om 00:30 NL bekeken.
  const tournament = { matches: [
    { matchId: 1, table: '1', start: '2026-07-29T21:50:00Z', status: 'playing' },
    { matchId: 2, table: '3', start: '2026-07-29T21:50:00Z', status: 'scheduled' },
  ] };
  const naMiddernacht = new Date('2026-07-29T22:30:00Z'); // 00:30 NL
  const tafels = cameraTablesWithMatchToday(tournament, [1, 3], naMiddernacht).map((t) => t.tableNumber);
  assert.deepStrictEqual(tafels.sort(), [1, 3]);
});

test('#77: de ochtend erna telt de avond van gisteren NIET meer mee', () => {
  const { cameraTablesWithMatchToday } = require('../src/planning/league');
  const tournament = { matches: [
    { matchId: 1, table: '1', start: '2026-07-29T21:50:00Z', status: 'playing' },
  ] };
  const volgendeMiddag = new Date('2026-07-30T10:00:00Z'); // 12:00 NL
  assert.deepStrictEqual(cameraTablesWithMatchToday(tournament, [1, 3], volgendeMiddag), []);
});
