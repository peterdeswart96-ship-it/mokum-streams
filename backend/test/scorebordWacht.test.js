const test = require('node:test');
const assert = require('node:assert');
const { vingerafdruk, volgendeRefreshToestand } = require('../src/planning/scorebordWacht');

// #153: op 21-09 stond er urenlang een bevroren stand in beeld terwijl Cuescore keurig bijhield
// wat er gebeurde. De browserbron in OBS was blijven hangen. Deze logica herlaadt die bron zodra
// er een nieuwe stand te tonen is.

const INTERVAL = 10 * 60 * 1000;

test('vingerafdruk: spelers + stand + wedstrijd-id vormen de afdruk', () => {
  const a = vingerafdruk({ status: 'PLAYING', matchId: 42, playerA: { name: 'Joris' }, playerB: { name: 'Moudar' }, scoreA: 1, scoreB: 3 });
  const b = vingerafdruk({ status: 'PLAYING', matchId: 42, playerA: { name: 'Joris' }, playerB: { name: 'Moudar' }, scoreA: 1, scoreB: 4 });
  assert.strictEqual(a, '42|Joris|Moudar|1|3');
  assert.notStrictEqual(a, b); // een gewonnen game verandert de afdruk
});

test('vingerafdruk: leest de stand ook als die onder `match` hangt', () => {
  const afdruk = vingerafdruk({ status: 'PLAYING', match: { matchId: 7, playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 2, scoreB: 3 } });
  assert.strictEqual(afdruk, '7|A|B|2|3');
});

// WAITING is hier géén "geen oordeel" maar een echte toestand: de overgang van een lege tafel
// naar een lopende partij is juist een moment waarop het beeld moet veranderen.
test('vingerafdruk: WAITING is een eigen toestand, geen null', () => {
  assert.strictEqual(vingerafdruk({ status: 'WAITING' }), 'WAITING');
});

test('vingerafdruk: onleesbare antwoorden geven null', () => {
  assert.strictEqual(vingerafdruk(null), null);
  assert.strictEqual(vingerafdruk('geen object'), null);
  assert.strictEqual(vingerafdruk({}), null);
});

test('de eerste waarneming ververst niet: de bron is net bij de start al herladen', () => {
  const s = volgendeRefreshToestand(null, 'm|A|B|0|0', 1_000_000, INTERVAL);
  assert.strictEqual(s.verversen, false);
  assert.strictEqual(s.laatsteRefresh, 1_000_000);
});

test('een gelijkblijvende stand ververst niet — een bevroren bron doet dan geen kwaad', () => {
  const t0 = 1_000_000;
  let s = volgendeRefreshToestand(null, 'm|A|B|0|0', t0, INTERVAL);
  for (const min of [5, 20, 60]) {
    s = volgendeRefreshToestand(s, 'm|A|B|0|0', t0 + min * 60000, INTERVAL);
    assert.strictEqual(s.verversen, false, `geen refresh na ${min} min stilstand`);
  }
});

test('een veranderde stand ververst, mits het interval om is', () => {
  const t0 = 1_000_000;
  let s = volgendeRefreshToestand(null, 'm|A|B|0|0', t0, INTERVAL);
  // na 11 minuten is er een game gewonnen
  s = volgendeRefreshToestand(s, 'm|A|B|1|0', t0 + 11 * 60000, INTERVAL);
  assert.strictEqual(s.verversen, true);
  assert.strictEqual(s.laatsteRefresh, t0 + 11 * 60000);
});

test('binnen het interval wordt niet opnieuw ververst, ook niet bij elke gewonnen game', () => {
  const t0 = 1_000_000;
  let s = volgendeRefreshToestand(null, 'm|A|B|0|0', t0, INTERVAL);
  s = volgendeRefreshToestand(s, 'm|A|B|1|0', t0 + 11 * 60000, INTERVAL);
  assert.strictEqual(s.verversen, true);
  // drie games in de tien minuten erna: geen van alle mag herladen
  for (const [min, stand] of [[13, '2|0'], [16, '2|1'], [20, '3|1']]) {
    s = volgendeRefreshToestand(s, `m|A|B|${stand}`, t0 + min * 60000, INTERVAL);
    assert.strictEqual(s.verversen, false, `geen refresh op minuut ${min}`);
  }
  // pas na het interval weer wel
  s = volgendeRefreshToestand(s, 'm|A|B|4|1', t0 + 22 * 60000, INTERVAL);
  assert.strictEqual(s.verversen, true);
});

test('een tafel die van leeg naar spelend gaat wordt ververst', () => {
  const t0 = 1_000_000;
  let s = volgendeRefreshToestand(null, 'WAITING', t0, INTERVAL);
  s = volgendeRefreshToestand(s, 'm|Joris|Moudar|0|0', t0 + 15 * 60000, INTERVAL);
  assert.strictEqual(s.verversen, true);
});

test('een onleesbaar antwoord laat de toestand ongemoeid', () => {
  const t0 = 1_000_000;
  const s = volgendeRefreshToestand(null, 'm|A|B|0|0', t0, INTERVAL);
  const na = volgendeRefreshToestand(s, null, t0 + 15 * 60000, INTERVAL);
  assert.strictEqual(na.verversen, false);
  assert.strictEqual(na.afdruk, s.afdruk);
  assert.strictEqual(na.laatsteRefresh, s.laatsteRefresh);
});
