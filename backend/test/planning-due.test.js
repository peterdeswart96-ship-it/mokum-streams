const test = require('node:test');
const assert = require('node:assert');
const { bepaalType, effectiveStart, planningDue, dueRecords, defaultRecord } = require('../src/planning/planning');

test('bepaalType: enkeldaags = tournament, meerdaags = competition', () => {
  assert.strictEqual(bepaalType('2026-07-14T17:30:00Z', '2026-07-14T21:00:00Z'), 'tournament');
  assert.strictEqual(bepaalType('2026-06-16T12:00:00Z', '2026-08-31T21:59:00Z'), 'competition');
  assert.strictEqual(bepaalType(null, null), 'tournament');
});

test('defaultRecord zet type op basis van de span', () => {
  assert.strictEqual(defaultRecord({ id: 1, start: '2026-07-14T17:30:00Z', stop: '2026-07-14T21:00:00Z' }).type, 'tournament');
  assert.strictEqual(defaultRecord({ id: 2, start: '2026-06-16T12:00:00Z', stop: '2026-08-31T21:59:00Z' }).type, 'competition');
});

test('effectiveStart neemt de override als die er is', () => {
  assert.strictEqual(effectiveStart({ plannedStart: 'A', startOverride: 'B' }), 'B');
  assert.strictEqual(effectiveStart({ plannedStart: 'A', startOverride: null }), 'A');
});

const TOERNOOI = {
  tournamentId: 1, type: 'tournament', enabled: true, planned: true, preRollMinuten: 10,
  plannedStart: '2026-07-14T17:30:00Z', plannedStop: '2026-07-14T21:00:00Z',
  tafels: [1, 3],
};

test('planningDue is waar binnen het aanmaakvenster (start − preRoll)', () => {
  assert.strictEqual(planningDue(TOERNOOI, new Date('2026-07-14T17:22:00Z')), true); // 8 min voor start
});

test('planningDue is onwaar ruim vóór het venster', () => {
  assert.strictEqual(planningDue(TOERNOOI, new Date('2026-07-14T17:00:00Z')), false); // 30 min voor start
});

test('planningDue is onwaar voor een uitgeschakeld record', () => {
  assert.strictEqual(planningDue({ ...TOERNOOI, enabled: false }, new Date('2026-07-14T17:22:00Z')), false);
});

test('planningDue is onwaar voor een niet-ingepland (concept) record', () => {
  assert.strictEqual(planningDue({ ...TOERNOOI, planned: false }, new Date('2026-07-14T17:22:00Z')), false);
});

test('planningDue slaat doorlopende competities over', () => {
  const league = { ...TOERNOOI, type: 'competition' };
  assert.strictEqual(planningDue(league, new Date('2026-07-14T17:22:00Z')), false);
});

test('dueRecords filtert alleen de records die nu aan de beurt zijn', () => {
  const records = [TOERNOOI, { ...TOERNOOI, tournamentId: 2, enabled: false }];
  const due = dueRecords(records, new Date('2026-07-14T17:22:00Z'));
  assert.deepStrictEqual(due.map((r) => r.tournamentId), [1]);
});
