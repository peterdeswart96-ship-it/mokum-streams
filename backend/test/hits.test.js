const test = require('node:test');
const assert = require('node:assert');
const { registreerHit, schoonPerDag, normaliseerSleutel } = require('../src/stats/hits');

// Unit-tests voor de pure teller-logica (#18 fase 1). Geen netwerk/opslag.

test('registreerHit telt op per bron, pagina en dag; muteert de input niet', () => {
  const s0 = null;
  const s1 = registreerHit(s0, { source: 'qr', page: 'standen', dagKey: '2026-07-12' });
  assert.strictEqual(s1.totaal, 1);
  assert.strictEqual(s1.perBron.qr, 1);
  assert.strictEqual(s1.perPagina.standen, 1);
  assert.strictEqual(s1.perDag['2026-07-12'].totaal, 1);
  assert.strictEqual(s1.perDag['2026-07-12'].perBron.qr, 1);

  const s2 = registreerHit(s1, { source: 'qr', page: 'standen', dagKey: '2026-07-12' });
  assert.strictEqual(s2.totaal, 2);
  assert.strictEqual(s2.perBron.qr, 2);
  assert.strictEqual(s1.totaal, 1, 'oude store blijft ongewijzigd (immutability)');
});

test('registreerHit valt terug op direct/mokumlive bij ontbrekende bron/pagina', () => {
  const s = registreerHit(null, { dagKey: '2026-07-12' });
  assert.strictEqual(s.perBron.direct, 1);
  assert.strictEqual(s.perPagina.mokumlive, 1);
});

test('normaliseerSleutel schoont rommelige/lange waarden op', () => {
  assert.strictEqual(normaliseerSleutel('QR', 'direct'), 'qr');
  assert.strictEqual(normaliseerSleutel('a b<script>', 'direct'), 'abscript');
  assert.strictEqual(normaliseerSleutel('', 'direct'), 'direct');
  assert.strictEqual(normaliseerSleutel('!!!', 'direct'), 'direct'); // niets bruikbaars → fallback
  assert.strictEqual(normaliseerSleutel('x'.repeat(50), 'direct').length, 24); // afgekapt
});

test('schoonPerDag houdt alleen de laatste N dagen', () => {
  let s = null;
  for (let d = 1; d <= 10; d++) {
    s = registreerHit(s, { source: 'qr', dagKey: `2026-07-${String(d).padStart(2, '0')}` });
  }
  const gesnoeid = schoonPerDag(s, 3);
  assert.deepStrictEqual(Object.keys(gesnoeid.perDag).sort(), ['2026-07-08', '2026-07-09', '2026-07-10']);
  assert.strictEqual(gesnoeid.totaal, 10, 'totaal blijft (alleen perDag wordt gesnoeid)');
});
