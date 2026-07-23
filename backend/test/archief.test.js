const test = require('node:test');
const assert = require('node:assert');
const {
  wedstrijdenVoorVideo,
  mergeWedstrijden,
  runoutsUitArchief,
  spelersSleutel,
} = require('../src/video/archief');

const INDEX = {
  videoId: 'abc123',
  tournamentId: 84675259,
  tableNumber: 3,
  tournamentName: 'Mokum MEGA Summer Ranking #24',
  datum: '2026-07-22',
  hoofdstukken: [
    { offsetSec: 0, spelers: ['Panchi Chen', 'Andy Fung'] },
    { offsetSec: 1500, spelers: ['Maartje Dingemans', 'Chris Jones'] },
    { offsetSec: 3600, spelers: ['Moudar Ali', 'Peter de Vries'] },
  ],
};

function wedstrijd(tafel, a, b, opts = {}) {
  return {
    table: String(tafel), roundName: opts.ronde || '',
    playerA: { name: a }, playerB: { name: b },
    scoreA: opts.scoreA, scoreB: opts.scoreB,
    runoutsA: opts.runoutsA || 0, runoutsB: opts.runoutsB || 0,
  };
}

test('spelersSleutel is volgorde- en hoofdletter-ongevoelig', () => {
  assert.strictEqual(spelersSleutel(['Andy Fung', 'Panchi Chen']), spelersSleutel(['panchi chen', ' ANDY FUNG ']));
});

test('wedstrijdenVoorVideo koppelt elke wedstrijd aan de hoofdstuk-offset + deep-link', () => {
  const t = { name: 'T', matches: [
    wedstrijd(3, 'Maartje Dingemans', 'Chris Jones', { ronde: 'Round 3', scoreA: 5, scoreB: 3 }),
  ] };
  const uit = wedstrijdenVoorVideo(INDEX, t);
  assert.strictEqual(uit.length, 1);
  assert.strictEqual(uit[0].offsetSec, 1500);
  assert.strictEqual(uit[0].url, 'https://youtu.be/abc123?t=1500');
  assert.deepStrictEqual(uit[0].spelers, ['Maartje Dingemans', 'Chris Jones']);
  assert.deepStrictEqual(uit[0].score, [5, 3]);
  assert.strictEqual(uit[0].ronde, 'Round 3');
  assert.strictEqual(uit[0].tafel, 3);
  assert.deepStrictEqual(uit[0].runouts, []);
});

test('run-outs komen per speler mee; beide spelers is mogelijk', () => {
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', { runoutsA: 2, runoutsB: 1 })] };
  const uit = wedstrijdenVoorVideo(INDEX, t);
  assert.deepStrictEqual(uit[0].runouts, [
    { speler: 'Panchi Chen', aantal: 2 },
    { speler: 'Andy Fung', aantal: 1 },
  ]);
});

test('wedstrijden op een andere tafel of buiten de video vallen weg', () => {
  const t = { name: 'T', matches: [
    wedstrijd(1, 'Maartje Dingemans', 'Chris Jones', { runoutsA: 1 }), // andere tafel
    wedstrijd(3, 'Onbekend A', 'Onbekend B', { runoutsA: 1 }),         // niet in de hoofdstukken
  ] };
  assert.deepStrictEqual(wedstrijdenVoorVideo(INDEX, t), []);
});

test('runoutsUitArchief maakt één regel per speler-met-run-out, met tegenstander', () => {
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', { runoutsA: 2, runoutsB: 1 })] };
  const ro = runoutsUitArchief(wedstrijdenVoorVideo(INDEX, t));
  assert.deepStrictEqual(ro.map((r) => [r.speler, r.tegenstander, r.aantal]), [
    ['Panchi Chen', 'Andy Fung', 2],
    ['Andy Fung', 'Panchi Chen', 1],
  ]);
  assert.strictEqual(ro[0].url, 'https://youtu.be/abc123?t=0');
});

test('mergeWedstrijden vervangt de regels van één video en sorteert nieuwste eerst', () => {
  const oud = [
    { videoId: 'abc123', datum: '2026-07-22', offsetSec: 10, spelers: ['Oud'] },
    { videoId: 'xyz789', datum: '2026-07-15', offsetSec: 20, spelers: ['Ander'] },
  ];
  const nieuw = [{ videoId: 'abc123', datum: '2026-07-22', offsetSec: 1500, spelers: ['Nieuw'] }];
  const uit = mergeWedstrijden(oud, 'abc123', nieuw);
  assert.deepStrictEqual(uit.map((r) => r.spelers[0]), ['Nieuw', 'Ander']);
});
