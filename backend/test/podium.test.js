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

// Helper: zet een match op een tafelnummer (voor de camera-scoped tests).
function opTafel(m, nr) { return { ...m, table: String(nr) }; }
const CAMS = [1, 3, 15, 16];

test('podiumVoorZaal: toont niets zolang een CAMERATAFEL nog speelt', () => {
  const afgerond = { name: 'A', matches: [opTafel(match('Final', 'finished', 'Anna', 5, 'Bob', 3), 1)] };
  const bezig = { name: 'B', matches: [opTafel(match('Round 1', 'playing', 'X', 1, 'Y', 0), 3)] };
  assert.strictEqual(podiumVoorZaal([afgerond, bezig], CAMS), null);
});

test('podiumVoorZaal: challenge op een NIET-cameratafel blokkeert het podium niet', () => {
  const toernooi = { name: 'Toernooi', matches: [opTafel(match('Final', 'finished', 'Anna', 5, 'Bob', 3), 1)] };
  const challenge = { name: 'Challenge', matches: [opTafel(match('Challenge', 'playing', 'X', 1, 'Y', 0), 8)] };
  const uit = podiumVoorZaal([toernooi, challenge], CAMS);
  assert.strictEqual(uit.tournamentName, 'Toernooi');
  assert.strictEqual(uit.podium[0].speler.name, 'Anna');
});

test('podiumVoorZaal: geen cameratafel meer bezig → podium van het (laatste) gefilmde toernooi', () => {
  const t1 = { name: 'Eerste', matches: [opTafel(match('Final', 'finished', 'Anna', 5, 'Bob', 3), 1)] };
  const t2 = { name: 'Tweede', matches: [opTafel(match('Final', 'finished', 'Cindy', 6, 'Dave', 2), 3)] };
  const uit = podiumVoorZaal([t1, t2], CAMS);
  assert.strictEqual(uit.tournamentName, 'Tweede'); // laatste in de lijst wint
  assert.strictEqual(uit.podium[0].speler.name, 'Cindy');
});

test('podiumVoorZaal: afgerond toernooi zonder cameratafel-wedstrijd → null', () => {
  const t = { name: 'A', matches: [opTafel(match('Final', 'finished', 'Anna', 5, 'Bob', 3), 8)] };
  assert.strictEqual(podiumVoorZaal([t], CAMS), null);
});

test('podiumVoorZaal: geen cameratafel bezig maar geen finale gespeeld → null', () => {
  const t = { name: 'A', matches: [opTafel(match('Semi final', 'finished', 'Anna', 4, 'Bob', 1), 1)] };
  assert.strictEqual(podiumVoorZaal([t], CAMS), null);
  assert.strictEqual(podiumVoorZaal([], CAMS), null);
});
