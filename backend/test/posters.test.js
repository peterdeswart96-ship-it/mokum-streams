const test = require('node:test');
const assert = require('node:assert');
const { bouwPosters, isGeldigOp, datumSleutel, vandaagAmsterdam } = require('../src/pauze/posters');

const blob = (naam, metadata = {}) => ({ naam, url: `https://opslag/pauze-posters/${naam}`, metadata });

test('datumSleutel accepteert alleen YYYY-MM-DD', () => {
  assert.strictEqual(datumSleutel('2026-09-01'), 20260901);
  assert.strictEqual(datumSleutel(' 2026-09-01 '), 20260901);
  // Nederlandse schrijfwijze is een veelgemaakte fout in de Portal.
  assert.strictEqual(datumSleutel('1-9-2026'), null);
  assert.strictEqual(datumSleutel('2026-13-01'), null);
  assert.strictEqual(datumSleutel('binnenkort'), null);
  assert.strictEqual(datumSleutel(undefined), null);
});

test('vandaagAmsterdam gebruikt de zaal-tijdzone, niet UTC', () => {
  // 00:30 lokaal in de zomer is 22:30Z de dag ervóór. Een poster met tot=2026-08-08 moet
  // dan al verlopen zijn, want in de zaal is het 9 augustus.
  assert.strictEqual(vandaagAmsterdam(new Date('2026-08-08T22:30:00Z')), '2026-08-09');
  // En andersom: 23:30 lokaal is nog gewoon dezelfde dag.
  assert.strictEqual(vandaagAmsterdam(new Date('2026-08-09T21:30:00Z')), '2026-08-09');
});

test('isGeldigOp: van en tot zijn inclusief', () => {
  const meta = { van: '2026-08-01', tot: '2026-08-31' };
  assert.strictEqual(isGeldigOp(meta, '2026-07-31'), false);
  assert.strictEqual(isGeldigOp(meta, '2026-08-01'), true);   // eerste dag telt mee
  assert.strictEqual(isGeldigOp(meta, '2026-08-31'), true);   // laatste dag ook
  assert.strictEqual(isGeldigOp(meta, '2026-09-01'), false);
});

test('isGeldigOp: bij twijfel tonen', () => {
  // Geen metadata → blijft hangen (het oude gedrag van de vaste poster).
  assert.strictEqual(isGeldigOp({}, '2026-08-09'), true);
  assert.strictEqual(isGeldigOp(undefined, '2026-08-09'), true);
  // Onleesbare datum telt als "niet ingevuld" i.p.v. als "verlopen".
  assert.strictEqual(isGeldigOp({ tot: '1-9-2026' }, '2026-12-01'), true);
  assert.strictEqual(isGeldigOp({ tot: 'zomer' }, '2026-12-01'), true);
});

test('bouwPosters laat verlopen posters weg en houdt de rest', () => {
  const posters = bouwPosters([
    blob('a.png', { tot: '2026-08-01' }),          // verlopen
    blob('b.png', { tot: '2026-09-01' }),          // geldig
    blob('c.png'),                                  // geen datum → blijft
    blob('d.png', { van: '2026-12-01' }),          // nog niet begonnen
  ], '2026-08-09');
  assert.deepStrictEqual(posters.map((p) => p.naam), ['b.png', 'c.png']);
});

test('bouwPosters sorteert op volgorde, daarna op naam', () => {
  const posters = bouwPosters([
    blob('zebra.png', { volgorde: '1' }),
    blob('appel.png', { volgorde: '2' }),
    blob('bijl.png', { volgorde: '2' }),
    blob('geen.png'),                               // zonder volgorde → achteraan
  ], '2026-08-09');
  assert.deepStrictEqual(posters.map((p) => p.naam), ['zebra.png', 'appel.png', 'bijl.png', 'geen.png']);
});

test('bouwPosters negeert alles wat geen afbeelding is', () => {
  const posters = bouwPosters([
    blob('poster.png'), blob('foto.JPG'), blob('nieuw.webp'),
    blob('aantekening.txt'), blob('map/'), blob('backup.json'),
  ], '2026-08-09');
  assert.deepStrictEqual(posters.map((p) => p.naam), ['foto.JPG', 'nieuw.webp', 'poster.png']);
});

test('bouwPosters geeft tot terug zoals ingevuld, en null bij onzin', () => {
  const [met, zonder] = bouwPosters([
    blob('a.png', { tot: '2026-09-01', volgorde: '1' }),
    blob('b.png', { tot: 'ooit', volgorde: 'x' }),
  ], '2026-08-09');
  assert.deepStrictEqual(met, { naam: 'a.png', url: 'https://opslag/pauze-posters/a.png', tot: '2026-09-01', volgorde: 1 });
  assert.deepStrictEqual(zonder, { naam: 'b.png', url: 'https://opslag/pauze-posters/b.png', tot: null, volgorde: null });
});

test('bouwPosters is veilig bij een lege of ontbrekende lijst', () => {
  assert.deepStrictEqual(bouwPosters([], '2026-08-09'), []);
  assert.deepStrictEqual(bouwPosters(null, '2026-08-09'), []);
  assert.deepStrictEqual(bouwPosters([null, {}], '2026-08-09'), []);
});
