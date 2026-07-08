const test = require('node:test');
const assert = require('node:assert');
const {
  parseTime,
  zaalDelen,
  isRuleDueNow,
  dueRules,
  tafelsNogTeMaken,
  scheduledStartISO,
} = require('../src/schedule/schedule');

// 2026-07-14 is een dinsdag; Amsterdam is in juli CEST (+2).
const REGEL = { id: 'di-fluke', dagVanDeWeek: 2, startTijd: '19:30', tafels: [1, 3], toernooinaam: 'Fluke ranking', leadMinuten: 15, actief: true };

test('parseTime rekent HH:MM om naar minuten', () => {
  assert.strictEqual(parseTime('19:30'), 1170);
  assert.strictEqual(parseTime('09:05'), 545);
  assert.throws(() => parseTime('25:00'), /ongeldige tijd/);
  assert.throws(() => parseTime('abc'), /ongeldige tijd/);
});

test('zaalDelen geeft weekdag/minuten/datum in Amsterdam-tijd', () => {
  const d = zaalDelen(new Date('2026-07-14T17:20:00Z')); // 19:20 CEST, dinsdag
  assert.strictEqual(d.dagVanDeWeek, 2);
  assert.strictEqual(d.minutenVanDeDag, 19 * 60 + 20);
  assert.strictEqual(d.datum, '2026-07-14');
});

test('isRuleDueNow is waar binnen het aanmaakvenster (lead vóór start)', () => {
  assert.strictEqual(isRuleDueNow(REGEL, new Date('2026-07-14T17:20:00Z')), true); // 19:20
});

test('isRuleDueNow is onwaar vóór het aanmaakvenster', () => {
  assert.strictEqual(isRuleDueNow(REGEL, new Date('2026-07-14T16:50:00Z')), false); // 18:50
});

test('isRuleDueNow is onwaar op een andere weekdag', () => {
  assert.strictEqual(isRuleDueNow(REGEL, new Date('2026-07-13T17:20:00Z')), false); // maandag
});

test('isRuleDueNow is onwaar voor een inactieve regel', () => {
  assert.strictEqual(isRuleDueNow({ ...REGEL, actief: false }, new Date('2026-07-14T17:20:00Z')), false);
});

test('dueRules filtert alleen de regels die nu aan de beurt zijn', () => {
  const rules = [REGEL, { ...REGEL, id: 'wo', dagVanDeWeek: 3 }];
  const due = dueRules(rules, new Date('2026-07-14T17:20:00Z'));
  assert.deepStrictEqual(due.map((r) => r.id), ['di-fluke']);
});

test('tafelsNogTeMaken laat al gemaakte tafels weg', () => {
  assert.deepStrictEqual(tafelsNogTeMaken(REGEL, {}), [1, 3]);
  assert.deepStrictEqual(tafelsNogTeMaken(REGEL, { '1': { videoId: 'x' } }), [3]);
  assert.deepStrictEqual(tafelsNogTeMaken(REGEL, { '1': {}, '3': {} }), []);
});

test('scheduledStartISO geeft de juiste UTC voor een Amsterdamse wandtijd', () => {
  // 2026-07-14 19:30 CEST = 17:30 UTC
  assert.strictEqual(
    scheduledStartISO(new Date('2026-07-14T00:00:00Z'), '19:30'),
    '2026-07-14T17:30:00.000Z'
  );
});
