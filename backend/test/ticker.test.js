const test = require('node:test');
const assert = require('node:assert');
const {
  normaliseerTicker, tickerVoorUitzending, STANDAARD_TICKER, MAX_REGELS, MAX_LENGTE,
} = require('../src/public/ticker');

test('normaliseerTicker trimt, ruimt witruimte op en gooit lege regels weg', () => {
  assert.deepStrictEqual(
    normaliseerTicker(['  Volgende   week   het   NK ', '', '   ', 'Bar is open']),
    ['Volgende week het NK', 'Bar is open']
  );
});

test('normaliseerTicker accepteert ook één tekstvak met regeleindes', () => {
  assert.deepStrictEqual(
    normaliseerTicker('Regel een\r\nRegel twee\n\nRegel drie'),
    ['Regel een', 'Regel twee', 'Regel drie']
  );
});

test('normaliseerTicker begrenst aantal regels en lengte per regel', () => {
  const veel = Array.from({ length: MAX_REGELS + 5 }, (_, i) => `regel ${i}`);
  assert.strictEqual(normaliseerTicker(veel).length, MAX_REGELS);
  assert.strictEqual(normaliseerTicker(['x'.repeat(MAX_LENGTE + 50)])[0].length, MAX_LENGTE);
});

test('normaliseerTicker geeft een lege lijst bij niets bruikbaars', () => {
  for (const invoer of [null, undefined, '', [], ['  ', '']]) {
    assert.deepStrictEqual(normaliseerTicker(invoer), []);
  }
});

test('tickerVoorUitzending valt terug op de standaardregel — de balk is nooit leeg', () => {
  assert.deepStrictEqual(tickerVoorUitzending([]), [STANDAARD_TICKER]);
  assert.deepStrictEqual(tickerVoorUitzending(null), [STANDAARD_TICKER]);
  assert.deepStrictEqual(tickerVoorUitzending(['Eigen tekst']), ['Eigen tekst']);
});
