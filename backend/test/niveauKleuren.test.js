const test = require('node:test');
const assert = require('node:assert');
const { kleurVoorNiveau, STANDAARD_KLEUR, verkortNiveau, verkortTeamnaam } = require('../src/mokumCompetitie/niveauKleuren');

test('elk bekend niveau heeft een eigen kleur, onbekend valt terug op grijs', () => {
  assert.strictEqual(kleurVoorNiveau('Eredivisie'), '#c98a00');
  assert.strictEqual(kleurVoorNiveau('Nieuwe Klasse'), STANDAARD_KLEUR);
});

test('verkortNiveau laat regio of plaats weg', () => {
  assert.strictEqual(verkortNiveau('Derde Divisie Noord-West'), 'Derde Divisie');
  assert.strictEqual(verkortNiveau('Eerste Klasse'), 'Eerste Klasse');
  assert.strictEqual(verkortNiveau('Tweede Klasse Amsterdam'), 'Tweede Klasse');
  assert.strictEqual(verkortNiveau('Eredivisie'), 'Eredivisie');
});

test('verkortTeamnaam haalt voorvoegsel en plaats weg, maar laat cijfers staan', () => {
  assert.strictEqual(verkortTeamnaam('Biljartvereniging De Gouden Keu (Amsterdam)'), 'De Gouden Keu');
  assert.strictEqual(verkortTeamnaam('Café Het Hoekje 2'), 'Het Hoekje 2');
  assert.strictEqual(verkortTeamnaam('Mokum Magic'), 'Mokum Magic');
  assert.strictEqual(verkortTeamnaam('BC'), 'BC');
});
