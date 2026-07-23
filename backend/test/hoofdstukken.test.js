const test = require('node:test');
const assert = require('node:assert');
const { bouwHoofdstukken, hoofdstukData, tijdstempel } = require('../src/video/hoofdstukken');

function match(table, startISO, a, b, round) {
  return { table: String(table), start: startISO, roundName: round || '',
    playerA: a ? { name: a } : null, playerB: b ? { name: b } : null };
}

test('tijdstempel: M:SS onder een uur, H:MM:SS erboven', () => {
  assert.strictEqual(tijdstempel(0), '0:00');
  assert.strictEqual(tijdstempel(154), '2:34');
  assert.strictEqual(tijdstempel(3725), '1:02:05');
});

test('hoofdstukData: offsets t.o.v. streamstart, alleen deze tafel, gesorteerd', () => {
  const start = '2026-07-19T11:00:00Z';
  const t = { matches: [
    match(1, '2026-07-19T11:25:00Z', 'Panchi Chen', 'Peter de Vries'),   // +25:00
    match(1, '2026-07-19T11:02:34Z', 'Maartje Dingemans', 'Andy Fung'),  // +2:34
    match(3, '2026-07-19T11:05:00Z', 'X', 'Y'),                          // andere tafel → weg
  ] };
  const h = hoofdstukData(start, t, 1);
  assert.strictEqual(h.length, 2);
  assert.deepStrictEqual(h.map((x) => [x.offsetSec, x.label]), [
    [154, 'Maartje Dingemans vs Andy Fung'],
    [1500, 'Panchi Chen vs Peter de Vries'],
  ]);
});

test('hoofdstukData: wedstrijd die net vóór de stream begon telt mee op 0:00', () => {
  const start = '2026-07-19T11:00:00Z';
  const t = { matches: [ match(1, '2026-07-19T10:59:10Z', 'A', 'B') ] }; // 50s ervoor (binnen marge)
  const h = hoofdstukData(start, t, 1);
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].offsetSec, 0);
});

test('hoofdstukData: wedstrijd ruim vóór de stream valt weg', () => {
  const start = '2026-07-19T11:00:00Z';
  const t = { matches: [ match(1, '2026-07-19T10:50:00Z', 'A', 'B') ] }; // 10 min ervoor
  assert.strictEqual(hoofdstukData(start, t, 1).length, 0);
});

test('hoofdstukData: te dicht op elkaar → minstens 10s gat (YouTube-eis)', () => {
  const start = '2026-07-19T11:00:00Z';
  const t = { matches: [
    match(1, '2026-07-19T11:00:05Z', 'A', 'B'),
    match(1, '2026-07-19T11:00:08Z', 'C', 'D'), // 3s later → wordt +10s
  ] };
  const h = hoofdstukData(start, t, 1);
  assert.strictEqual(h[0].offsetSec, 5);
  assert.strictEqual(h[1].offsetSec, 15);
});

test('bouwHoofdstukken: beschrijving begint met 0:00 (Aanvang toegevoegd) + kop + spelers', () => {
  const start = '2026-07-19T11:00:00Z';
  const t = { name: 'MEGA Ranking #22', matches: [
    match(1, '2026-07-19T11:02:34Z', 'Maartje Dingemans', 'Andy Fung', 'Round 1'),
    match(1, '2026-07-19T11:30:00Z', 'Chris Jones', 'Moudar Ali', 'Round 3'),
  ] };
  const { beschrijving, hoofdstukken } = bouwHoofdstukken(start, t, 1);
  // Mokum Live-promo helemaal bovenaan (met UTM-tracking), gevolgd door de rest.
  assert.ok(beschrijving.startsWith('Volg alle standen en livestreams via: https://mokum-streams.pdscloud.nl/mokumlive/?utm_source=youtube'));
  assert.ok(beschrijving.includes('- Switch tussen alle streams'));
  assert.ok(beschrijving.includes('- Zie alle toernooi standen (met filters)'));
  assert.ok(beschrijving.includes('MEGA Ranking #22 — Tafel 1 —'));
  assert.ok(beschrijving.includes('0:00 Aanvang'));
  assert.ok(beschrijving.includes('2:34 Maartje Dingemans vs Andy Fung'));
  assert.ok(beschrijving.includes('30:00 Chris Jones vs Moudar Ali'));
  // hoofdstukdata voor #59: elke wedstrijd met spelers + tijd.
  assert.strictEqual(hoofdstukken[0].spelers.length, 2);
});

test('bouwHoofdstukken: eerste wedstrijd op 0:00 → geen extra Aanvang-regel', () => {
  const start = '2026-07-19T11:00:00Z';
  const t = { name: 'T', matches: [
    match(1, '2026-07-19T11:00:00Z', 'A', 'B'),
    match(1, '2026-07-19T11:20:00Z', 'C', 'D'),
  ] };
  const { beschrijving } = bouwHoofdstukken(start, t, 1);
  assert.ok(!beschrijving.includes('Aanvang'));
  assert.ok(beschrijving.includes('0:00 A vs B'));
});

test('hoofdstukData: wedstrijden ná het einde van de video vallen weg (afgebroken stream)', () => {
  const start = '2026-07-12T08:19:23Z';
  const t = { matches: [
    match(15, '2026-07-12T08:20:00Z', 'A', 'B'),  // +37s, binnen de 2 minuten
    match(15, '2026-07-12T14:55:00Z', 'C', 'D'),  // uren later → hoort in de ándere video
  ] };
  const zonderGrens = hoofdstukData(start, t, 15);
  assert.strictEqual(zonderGrens.length, 2);
  const metGrens = hoofdstukData(start, t, 15, { eindISO: '2026-07-12T08:21:04Z' });
  assert.deepStrictEqual(metGrens.map((h) => h.label), ['A vs B']);
});
