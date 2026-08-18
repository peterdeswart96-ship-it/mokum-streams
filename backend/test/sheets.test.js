const test = require('node:test');
const assert = require('node:assert');
const { amsterdamDelen, winnaarUitToernooi, winnaarRegel, bouwWinnaars, bouwKomende } = require('../src/sheets/sheets');

// Genormaliseerd toernooi zoals normalizeTournament het teruggeeft (alleen de velden die
// de sheet-logica gebruikt).
function toernooi({ name, discipline, start, finished, finaleScore }) {
  const matches = [];
  if (finaleScore) {
    matches.push({
      roundName: 'Round 1', status: 'finished',
      playerA: { name: 'Iemand' }, playerB: { name: 'Anders' }, scoreA: 3, scoreB: 0,
    });
    matches.push({
      roundName: 'Final', status: 'finished',
      playerA: { name: 'Aryya Widigdha' }, playerB: { name: 'Bas Clason' },
      scoreA: finaleScore[0], scoreB: finaleScore[1],
    });
  }
  return { name, discipline, start, finished, matches };
}

test('amsterdamDelen zet een UTC-tijd om naar de zaal-tijdzone', () => {
  // 17:15Z in de zomer (CEST, +2) → 19:15 lokaal, 27 juli.
  assert.deepStrictEqual(amsterdamDelen('2026-07-27T17:15:00Z'),
    { dag: '27', mnd: 'jul', jaar: '2026', tijd: '19:15' });
});

test('amsterdamDelen is veilig bij lege/onbruikbare invoer', () => {
  assert.deepStrictEqual(amsterdamDelen(null), { dag: '', mnd: '', jaar: '', tijd: '' });
  assert.deepStrictEqual(amsterdamDelen('geen-datum'), { dag: '', mnd: '', jaar: '', tijd: '' });
});

test('winnaarUitToernooi geeft wie de finale won', () => {
  // Aryya 2 - 3 Bas → Bas Clason wint (zoals Fluke #24 in het echt).
  assert.strictEqual(winnaarUitToernooi(toernooi({ finaleScore: [2, 3] })), 'Bas Clason');
  assert.strictEqual(winnaarUitToernooi(toernooi({ finaleScore: [3, 1] })), 'Aryya Widigdha');
});

test('winnaarUitToernooi: geen finale of gelijkspel → null', () => {
  assert.strictEqual(winnaarUitToernooi(toernooi({})), null);          // geen finale gespeeld
  assert.strictEqual(winnaarUitToernooi(toernooi({ finaleScore: [2, 2] })), null); // gelijk
  assert.strictEqual(winnaarUitToernooi(null), null);
});

test('winnaarRegel bevat naam, toernooi, discipline en zaal-datum', () => {
  const r = winnaarRegel(toernooi({
    name: 'Fluke ranking 9ball Seizoen 3 #24', discipline: '9-Ball',
    start: '2026-07-21T17:30:00Z', finished: true, finaleScore: [2, 3],
  }));
  assert.deepStrictEqual(r, {
    winner: 'Bas Clason', toernooi: 'Fluke ranking 9ball Seizoen 3 #24',
    discipline: '9-Ball', datum: '21 jul 2026',
  });
});

test('bouwWinnaars: alleen afgeronde met winnaar, nieuwste eerst, gecapt', () => {
  const lijst = [
    toernooi({ name: 'A', start: '2026-07-20T18:00:00Z', finished: true, finaleScore: [3, 1] }),
    toernooi({ name: 'B (lopend)', start: '2026-07-22T18:00:00Z', finished: false, finaleScore: [3, 0] }),
    toernooi({ name: 'C', start: '2026-07-21T18:00:00Z', finished: true, finaleScore: [1, 3] }),
    toernooi({ name: 'D (geen finale)', start: '2026-07-19T18:00:00Z', finished: true }),
  ];
  const uit = bouwWinnaars(lijst, { max: 5 });
  assert.deepStrictEqual(uit.map((r) => r.toernooi), ['C', 'A']); // B lopend, D geen winnaar
  assert.strictEqual(bouwWinnaars(lijst, { max: 1 }).length, 1);
});

test('bouwKomende: geplande toernooien, vroegste eerst, met dag/mnd/tijd', () => {
  const lijst = [
    { name: 'MEGA #26', discipline: '9-Ball', start: '2026-07-29T17:15:00Z', finished: false },
    { name: 'Ranking #20', discipline: '10-Ball', start: '2026-07-25T10:30:00Z', finished: false },
    { name: 'Al klaar', discipline: '9-Ball', start: '2026-07-24T17:00:00Z', finished: true },
  ];
  const uit = bouwKomende(lijst, { max: 5 });
  assert.deepStrictEqual(uit.map((r) => r.naam), ['Ranking #20', 'MEGA #26']); // afgerond eruit
  assert.deepStrictEqual(uit[0], { dag: '25', mnd: 'jul', tijd: '12:30', naam: 'Ranking #20', discipline: '10-Ball' });
});

// #97: een doorlopende competitie (bijv. de 14.1 Summer League) heeft geen "aanvangstijd"
// in de zin van deze sheet — `start` is de datum waarop de competitie ooit begon, vaak
// maanden terug. Zonder filter zou zoiets bovenaan blijven hangen (vroegste start wint de
// sortering) en een echt toernooi van de avond verdringen.
test('#97: een doorlopende competitie van twee maanden valt weg, een toernooi van een avond blijft', () => {
  const lijst = [
    { name: 'Mokum 14.1 Summer league', start: '2026-06-16T12:00:00Z', stop: '2026-08-31T22:00:00Z', finished: false },
    { name: 'Fluke ranking #28', discipline: '9-Ball', start: '2026-08-18T17:30:00Z', stop: '2026-08-18T22:00:00Z', finished: false },
  ];
  const uit = bouwKomende(lijst, { max: 5 });
  assert.deepStrictEqual(uit.map((r) => r.naam), ['Fluke ranking #28']);
});

test('#97: ontbrekende stop telt als enkeldaags — blijft staan (veilige kant, kan geen doorlopende competitie herkennen)', () => {
  const lijst = [
    { name: 'Toernooi zonder stoptime', start: '2026-08-19T17:15:00Z', stop: null, finished: false },
  ];
  const uit = bouwKomende(lijst, { max: 5 });
  assert.deepStrictEqual(uit.map((r) => r.naam), ['Toernooi zonder stoptime']);
});

test('#97: een gewoon avondtoernooi met start én stop binnen 26 uur blijft gewoon staan', () => {
  const lijst = [
    // 17:15 tot 01:00 de volgende ochtend — een lange finaleavond, geen doorlopende league.
    { name: 'Avondtoernooi', start: '2026-08-22T17:15:00Z', stop: '2026-08-23T01:00:00Z', finished: false },
  ];
  assert.deepStrictEqual(bouwKomende(lijst, { max: 5 }).map((r) => r.naam), ['Avondtoernooi']);
});
