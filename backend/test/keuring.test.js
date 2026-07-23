const test = require('node:test');
const assert = require('node:assert');
const { clipSleutel, zetKeuring, metKeuring, goedgekeurd, tel } = require('../src/public/keuring');

const CLIPS = [
  { videoId: 'aaa', clipVan: 100, clipTot: 250, speler: 'A' },
  { videoId: 'aaa', clipVan: 900, clipTot: 1050, speler: 'B' },
  { videoId: 'bbb', clipVan: 40, clipTot: 190, speler: 'C' },
];

test('clipSleutel is video + startseconde, en null zonder clipvenster', () => {
  assert.strictEqual(clipSleutel(CLIPS[0]), 'aaa:100');
  assert.strictEqual(clipSleutel({ videoId: 'aaa' }), null);
  assert.strictEqual(clipSleutel(null), null);
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
