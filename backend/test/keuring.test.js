const test = require('node:test');
const assert = require('node:assert');
const { clipSleutel, zetKeuring, metKeuring, goedgekeurd, tel } = require('../src/public/keuring');

const CLIPS = [
  { videoId: 'aaa', offsetSec: 100, clipVan: 100, clipTot: 250, speler: 'A' },
  { videoId: 'aaa', offsetSec: 900, clipVan: 900, clipTot: 1050, speler: 'B' },
  { videoId: 'bbb', offsetSec: 40, clipVan: 40, clipTot: 190, speler: 'C' },
];

test('clipSleutel hangt aan het RACK-moment, niet aan het clipvenster', () => {
  assert.strictEqual(clipSleutel(CLIPS[0]), 'aaa:100');
  // Venster verschoven, rack gelijk → zelfde sleutel, dus het oordeel blijft staan.
  assert.strictEqual(clipSleutel({ ...CLIPS[0], clipVan: 55 }), 'aaa:100');
  assert.strictEqual(clipSleutel({ videoId: 'aaa' }), null);
  assert.strictEqual(clipSleutel(null), null);
});

test('een eigen startseconde verschuift het clipvenster', () => {
  const k = { 'aaa:100': { status: 'goed', start: 130 } };
  const c = metKeuring(CLIPS, k)[0];
  assert.strictEqual(c.clipVan, 130);
  assert.strictEqual(c.startAangepast, true);
  assert.strictEqual(c.clipTot, 250, 'einde blijft ongemoeid');
});

test('een startseconde voorbij het einde wordt teruggeduwd', () => {
  const c = metKeuring(CLIPS, { 'aaa:100': { start: 9999 } })[0];
  assert.strictEqual(c.clipVan, 245); // clipTot - 5
});

test('status en startseconde staan los van elkaar', () => {
  let k = zetKeuring({}, 'aaa:100', { start: 140 }, 'nu');
  assert.deepStrictEqual(k['aaa:100'], { start: 140, at: 'nu' });
  k = zetKeuring(k, 'aaa:100', { status: 'goed' }, 'nu2');
  assert.deepStrictEqual(k['aaa:100'], { status: 'goed', start: 140, at: 'nu2' }, 'start blijft staan');
  k = zetKeuring(k, 'aaa:100', { start: null }, 'nu3');
  assert.deepStrictEqual(k['aaa:100'], { status: 'goed', at: 'nu3' }, 'terug naar standaard-venster');
});

test('zetKeuring bewaart alleen geldige statussen en laat het origineel heel', () => {
  const leeg = {};
  const na = zetKeuring(leeg, 'aaa:100', 'goed', '2026-07-23T12:00:00Z');
  assert.deepStrictEqual(leeg, {}, 'origineel ongewijzigd');
  assert.deepStrictEqual(na['aaa:100'], { status: 'goed', at: '2026-07-23T12:00:00Z' });
  // Onzin-status telt als "nog niet gekeurd" → niets opslaan.
  assert.deepStrictEqual(zetKeuring({}, 'aaa:100', 'misschien'), {});
});

test('zetKeuring met een lege status draait het oordeel terug', () => {
  const na = zetKeuring({ 'aaa:100': { status: 'afgekeurd' } }, 'aaa:100', null);
  assert.strictEqual(na['aaa:100'], undefined);
});

test('metKeuring hangt sleutel en oordeel aan elke clip', () => {
  const k = { 'aaa:100': { status: 'goed' }, 'bbb:40': { status: 'afgekeurd' } };
  assert.deepStrictEqual(metKeuring(CLIPS, k).map((c) => [c.sleutel, c.keuring]), [
    ['aaa:100', 'goed'],
    ['aaa:900', null],
    ['bbb:40', 'afgekeurd'],
  ]);
});

test('de uitzending krijgt alleen goedgekeurde clips — ongekeurd telt niet mee', () => {
  const k = { 'aaa:100': { status: 'goed' }, 'bbb:40': { status: 'afgekeurd' } };
  assert.deepStrictEqual(goedgekeurd(CLIPS, k).map((c) => c.speler), ['A']);
  assert.deepStrictEqual(goedgekeurd(CLIPS, {}), []);
});

test('tel geeft de voortgang van de keuring', () => {
  const k = { 'aaa:100': { status: 'goed' }, 'bbb:40': { status: 'afgekeurd' } };
  assert.deepStrictEqual(tel(CLIPS, k), { totaal: 3, goed: 1, afgekeurd: 1, tekeuren: 1 });
});
