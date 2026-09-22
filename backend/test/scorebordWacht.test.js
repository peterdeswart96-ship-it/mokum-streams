const test = require('node:test');
const assert = require('node:assert');
const { vingerafdruk, volgendeScorebordToestand } = require('../src/planning/scorebordWacht');

// #153: op 21-09 stond er 3,5 uur lang 0-0 in beeld. De overlay werkte prima — de stand eronder
// bewoog niet. Dit vangnet merkt dat op en haalt het scorebord weg.

const DREMPEL = 30 * 60 * 1000;

test('vingerafdruk: spelers + stand + wedstrijd-id vormen de afdruk', () => {
  const a = vingerafdruk({ status: 'PLAYING', matchId: 42, playerA: { name: 'Max' }, playerB: { name: 'Maartje' }, scoreA: 0, scoreB: 0 });
  const b = vingerafdruk({ status: 'PLAYING', matchId: 42, playerA: { name: 'Max' }, playerB: { name: 'Maartje' }, scoreA: 1, scoreB: 0 });
  assert.strictEqual(a, '42|Max|Maartje|0|0');
  assert.notStrictEqual(a, b); // een gewonnen game verandert de afdruk
});

test('vingerafdruk: leest de stand ook als die onder `match` hangt', () => {
  const afdruk = vingerafdruk({ status: 'PLAYING', match: { matchId: 7, playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 2, scoreB: 3 } });
  assert.strictEqual(afdruk, '7|A|B|2|3');
});

test('vingerafdruk: WAITING en onherkenbare antwoorden geven null (geen oordeel)', () => {
  assert.strictEqual(vingerafdruk({ status: 'WAITING' }), null);
  assert.strictEqual(vingerafdruk({ iets: 'anders' }), null);
  assert.strictEqual(vingerafdruk(null), null);
  assert.strictEqual(vingerafdruk('geen object'), null);
});

test('een bewegende stand laat het scorebord met rust', () => {
  const t0 = 1_000_000;
  let s = volgendeScorebordToestand(null, 'm|Max|Maartje|0|0', t0, DREMPEL);
  assert.strictEqual(s.actie, null);
  // 10 minuten later een game gewonnen
  s = volgendeScorebordToestand(s, 'm|Max|Maartje|1|0', t0 + 10 * 60000, DREMPEL);
  assert.strictEqual(s.actie, null);
  assert.strictEqual(s.verborgen, false);
});

test('een stilstaande stand haalt het scorebord na de drempel uit beeld', () => {
  const t0 = 1_000_000;
  const afdruk = 'm|Max|Maartje|0|0';
  let s = volgendeScorebordToestand(null, afdruk, t0, DREMPEL);
  // 29 minuten: nog niets doen
  s = volgendeScorebordToestand(s, afdruk, t0 + 29 * 60000, DREMPEL);
  assert.strictEqual(s.actie, null);
  assert.strictEqual(s.verborgen, false);
  // 30 minuten: weg ermee
  s = volgendeScorebordToestand(s, afdruk, t0 + 30 * 60000, DREMPEL);
  assert.strictEqual(s.actie, 'verbergen');
  assert.strictEqual(s.verborgen, true);
});

test('verbergen gebeurt één keer, niet elke minuut opnieuw', () => {
  const t0 = 1_000_000;
  const afdruk = 'm|Max|Maartje|0|0';
  let s = volgendeScorebordToestand(null, afdruk, t0, DREMPEL);
  s = volgendeScorebordToestand(s, afdruk, t0 + 30 * 60000, DREMPEL);
  assert.strictEqual(s.actie, 'verbergen');
  for (const min of [31, 32, 90]) {
    s = volgendeScorebordToestand(s, afdruk, t0 + min * 60000, DREMPEL);
    assert.strictEqual(s.actie, null, `geen herhaald commando na ${min} min`);
    assert.strictEqual(s.verborgen, true);
  }
});

test('beweegt de stand daarna weer, dan komt het scorebord terug', () => {
  const t0 = 1_000_000;
  const afdruk = 'm|Max|Maartje|0|0';
  let s = volgendeScorebordToestand(null, afdruk, t0, DREMPEL);
  s = volgendeScorebordToestand(s, afdruk, t0 + 30 * 60000, DREMPEL);
  assert.strictEqual(s.actie, 'verbergen');
  // nieuwe partij op de tafel
  s = volgendeScorebordToestand(s, 'm2|Cas|Tjeerd|0|0', t0 + 31 * 60000, DREMPEL);
  assert.strictEqual(s.actie, 'tonen');
  assert.strictEqual(s.verborgen, false);
});

test('geen oordeel (Cuescore onbereikbaar of WAITING) laat de toestand ongemoeid', () => {
  const t0 = 1_000_000;
  const afdruk = 'm|Max|Maartje|0|0';
  let s = volgendeScorebordToestand(null, afdruk, t0, DREMPEL);
  s = volgendeScorebordToestand(s, afdruk, t0 + 30 * 60000, DREMPEL);
  assert.strictEqual(s.verborgen, true);
  // een ronde zonder oordeel: niet terugzetten, niet opnieuw verbergen
  const na = volgendeScorebordToestand(s, null, t0 + 31 * 60000, DREMPEL);
  assert.strictEqual(na.actie, null);
  assert.strictEqual(na.verborgen, true);
  assert.strictEqual(na.sinds, s.sinds); // de klok loopt gewoon door
});

test('een onbekende tafel begint neutraal: nooit meteen verbergen', () => {
  const s = volgendeScorebordToestand(null, 'm|A|B|0|0', 5_000_000, DREMPEL);
  assert.strictEqual(s.actie, null);
  assert.strictEqual(s.verborgen, false);
});
