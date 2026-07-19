const test = require('node:test');
const assert = require('node:assert');
const { podiumVan, podiumVoorZaal, winnaarVerliezer } = require('../src/planning/podium');

// Helper: bouwt een genormaliseerde wedstrijd zoals normalizeMatch die oplevert.
function match(round, status, a, sa, b, sb) {
  const speler = (naam) => (naam ? { name: naam, image: `img/${naam}.png`, flag: `flag/${naam}.png` } : null);
  return { roundName: round, status, playerA: speler(a), scoreA: sa, playerB: speler(b), scoreB: sb };
}

test('winnaarVerliezer: hoogste stand wint; gelijk/onbekend → beide null', () => {
  const m = match('Final', 'finished', 'Anna', 5, 'Bob', 3);
  assert.strictEqual(winnaarVerliezer(m).winnaar.name, 'Anna');
  assert.strictEqual(winnaarVerliezer(m).verliezer.name, 'Bob');
  assert.strictEqual(winnaarVerliezer(match('Final', 'finished', 'Anna', 4, 'Bob', 4)).winnaar, null);
  assert.strictEqual(winnaarVerliezer(match('Final', 'finished', 'Anna', null, 'Bob', 2)).winnaar, null);
});

test('podiumVan: leidt 1e/2e uit de finale en gedeeld 3e uit de halve finales af', () => {
  const t = {
    name: 'Fluke ranking',
    matches: [
      match('Semi final', 'finished', 'Anna', 4, 'Cindy', 2), // Cindy verliest halve finale
      match('Semi final', 'finished', 'Bob', 4, 'Dave', 1),   // Dave verliest halve finale
      match('Final', 'finished', 'Anna', 5, 'Bob', 3),        // Anna wint finale
    ],
  };
  const p = podiumVan(t);
  assert.strictEqual(p.length, 4);
  assert.deepStrictEqual(p.map((x) => [x.positie, x.medaille, x.speler.name]), [
    [1, 'goud', 'Anna'],
    [2, 'zilver', 'Bob'],
    [3, 'brons', 'Cindy'],
    [3, 'brons', 'Dave'],
  ]);
  // Spelersfoto + vlag komen mee.
  assert.strictEqual(p[0].speler.image, 'img/Anna.png');
  assert.strictEqual(p[0].speler.flag, 'flag/Anna.png');
});

test('podiumVan: geen (afgeronde) finale → null', () => {
  assert.strictEqual(podiumVan({ matches: [match('Final', 'playing', 'Anna', 2, 'Bob', 1)] }), null);
  assert.strictEqual(podiumVan({ matches: [match('Semi final', 'finished', 'Anna', 4, 'Bob', 1)] }), null);
  assert.strictEqual(podiumVan({ matches: [] }), null);
  assert.strictEqual(podiumVan(null), null);
});

test('podiumVan: finale zonder halve finales geeft alleen 1e + 2e', () => {
  const p = podiumVan({ matches: [match('Final', 'finished', 'Anna', 3, 'Bob', 0)] });
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].speler.name, 'Anna');
  assert.strictEqual(p[1].speler.name, 'Bob');
});

test('podiumVoorZaal: toont niets zolang er nog iemand speelt', () => {
  const afgerond = { name: 'A', matches: [match('Final', 'finished', 'Anna', 5, 'Bob', 3)] };
  const bezig = { name: 'B', matches: [match('Round 1', 'playing', 'X', 1, 'Y', 0)] };
  assert.strictEqual(podiumVoorZaal([afgerond, bezig]), null);
});

test('podiumVoorZaal: geen speler meer → podium van het (laatste) afgeronde toernooi', () => {
  const t1 = { name: 'Eerste', matches: [match('Final', 'finished', 'Anna', 5, 'Bob', 3)] };
  const t2 = { name: 'Tweede', matches: [match('Final', 'finished', 'Cindy', 6, 'Dave', 2)] };
  const uit = podiumVoorZaal([t1, t2]);
  assert.strictEqual(uit.tournamentName, 'Tweede'); // laatste in de lijst wint
  assert.strictEqual(uit.podium[0].speler.name, 'Cindy');
});

test('podiumVoorZaal: niemand speelt maar geen finale gespeeld → null', () => {
  const t = { name: 'A', matches: [match('Semi final', 'finished', 'Anna', 4, 'Bob', 1)] };
  assert.strictEqual(podiumVoorZaal([t]), null);
  assert.strictEqual(podiumVoorZaal([]), null);
});
