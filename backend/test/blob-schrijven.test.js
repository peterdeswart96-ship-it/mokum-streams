const test = require('node:test');
const assert = require('node:assert');
const { vergelijkbareVorm } = require('../src/storage/blob');

// De vergelijkingslogica achter writeJsonAlsGewijzigd (#101). Puur, dus zonder Azure te
// testen. Het schrijven zelf is een dunne laag om writeJson heen; wat mis kan gaan is de
// vraag "is dit hetzelfde als de vorige keer", en dat is precies wat hier getest wordt.

test('identieke objecten geven dezelfde vorm', () => {
  assert.strictEqual(
    vergelijkbareVorm({ a: 1, b: [2, 3] }),
    vergelijkbareVorm({ a: 1, b: [2, 3] }),
  );
});

test('een echte wijziging geeft een andere vorm', () => {
  assert.notStrictEqual(
    vergelijkbareVorm({ tafel: 1, score: 3 }),
    vergelijkbareVorm({ tafel: 1, score: 4 }),
  );
});

test('genegeerde velden tellen niet mee', () => {
  // Dit is het geval van live-matches.json: updatedAt verandert elke ronde, de rest niet.
  const a = { updatedAt: '2026-08-09T10:00:00Z', matches: { 1: 'Jan' } };
  const b = { updatedAt: '2026-08-09T10:01:00Z', matches: { 1: 'Jan' } };
  assert.strictEqual(vergelijkbareVorm(a, ['updatedAt']), vergelijkbareVorm(b, ['updatedAt']));
  // Zonder negeren zou je alsnog elke minuut schrijven — precies wat we wilden voorkomen.
  assert.notStrictEqual(vergelijkbareVorm(a), vergelijkbareVorm(b));
});

test('een genegeerd veld verbergt geen echte wijziging', () => {
  const a = { updatedAt: '2026-08-09T10:00:00Z', matches: { 1: 'Jan' } };
  const b = { updatedAt: '2026-08-09T10:01:00Z', matches: { 1: 'Piet' } };
  assert.notStrictEqual(vergelijkbareVorm(a, ['updatedAt']), vergelijkbareVorm(b, ['updatedAt']));
});

test('genest voorkomen van een genegeerde sleutel telt ook niet mee', () => {
  // JSON.stringify past de replacer op elk niveau toe. Dat is hier gewenst: een tijdstempel
  // dieper in de structuur zou anders alsnog elke ronde verschil opleveren.
  const a = { data: { updatedAt: 'a', waarde: 1 } };
  const b = { data: { updatedAt: 'b', waarde: 1 } };
  assert.strictEqual(vergelijkbareVorm(a, ['updatedAt']), vergelijkbareVorm(b, ['updatedAt']));
});

test('volgorde van sleutels telt wél mee', () => {
  // Bekende beperking: JSON.stringify volgt de invoegvolgorde. Dat kan een overbodige
  // schrijfactie opleveren, maar nooit een gemiste wijziging — de veilige kant op. Onze
  // objecten worden elke ronde in dezelfde volgorde opgebouwd, dus in de praktijk speelt
  // het niet.
  assert.notStrictEqual(vergelijkbareVorm({ a: 1, b: 2 }), vergelijkbareVorm({ b: 2, a: 1 }));
});

test('leeg en ontbrekend zijn niet hetzelfde', () => {
  assert.notStrictEqual(vergelijkbareVorm({}), vergelijkbareVorm({ a: undefined, b: 1 }));
});
