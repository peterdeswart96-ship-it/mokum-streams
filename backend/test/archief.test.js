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
    start: opts.start || null,
    runoutsA: opts.runoutsA || 0, runoutsB: opts.runoutsB || 0,
    runoutRacks: opts.runoutRacks || [],
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

test('run-out linkt naar het begin van dát rack, niet naar het begin van de partij', () => {
  // Partij begint op de hoofdstuk-offset 1500s; het run-out-rack start 12 min later.
  const t = { name: 'T', matches: [wedstrijd(3, 'Maartje Dingemans', 'Chris Jones', {
    start: '2026-07-22T19:00:00Z',
    runoutsB: 1,
    runoutRacks: [{ kant: 'B', start: '2026-07-22T19:12:30Z', eind: '2026-07-22T19:16:00Z' }],
  })] };
  const uit = wedstrijdenVoorVideo(INDEX, t);
  assert.strictEqual(uit[0].offsetSec, 1500);              // partij zelf onveranderd
  assert.deepStrictEqual(uit[0].runouts, [{
    speler: 'Chris Jones', offsetSec: 2250, eindSec: 2460, clipVan: 2310, clipTot: 2464,
    url: 'https://youtu.be/abc123?t=2250', exact: true,
  }]);
});

test('twee run-outs in één partij → twee racks, elk met een eigen moment', () => {
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {
    start: '2026-07-22T19:00:00Z',
    runoutsA: 1, runoutsB: 1,
    runoutRacks: [
      { kant: 'A', start: '2026-07-22T19:05:00Z' },
      { kant: 'B', start: '2026-07-22T19:20:00Z' },
    ],
  })] };
  const uit = wedstrijdenVoorVideo(INDEX, t);
  assert.deepStrictEqual(uit[0].runouts.map((r) => [r.speler, r.offsetSec]), [
    ['Panchi Chen', 300], ['Andy Fung', 1200],
  ]);
});

test('zonder rack-log (oudere data) valt de run-out terug op het begin van de partij', () => {
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', { runoutsA: 2 })] };
  const uit = wedstrijdenVoorVideo(INDEX, t);
  const leeg = { eindSec: null, clipVan: null, clipTot: null };
  assert.deepStrictEqual(uit[0].runouts, [
    { speler: 'Panchi Chen', offsetSec: 0, ...leeg, url: 'https://youtu.be/abc123?t=0', exact: false },
    { speler: 'Panchi Chen', offsetSec: 0, ...leeg, url: 'https://youtu.be/abc123?t=0', exact: false },
  ]);
});

test('wedstrijden op een andere tafel of buiten de video vallen weg', () => {
  const t = { name: 'T', matches: [
    wedstrijd(1, 'Maartje Dingemans', 'Chris Jones', { runoutsA: 1 }), // andere tafel
    wedstrijd(3, 'Onbekend A', 'Onbekend B', { runoutsA: 1 }),         // niet in de hoofdstukken
  ] };
  assert.deepStrictEqual(wedstrijdenVoorVideo(INDEX, t), []);
});

test('runoutsUitArchief maakt één regel per rack, met tegenstander en het rack-moment', () => {
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {
    start: '2026-07-22T19:00:00Z',
    runoutsA: 1, runoutsB: 1,
    runoutRacks: [
      { kant: 'A', start: '2026-07-22T19:05:00Z' },
      { kant: 'B', start: '2026-07-22T19:20:00Z' },
    ],
  })] };
  const ro = runoutsUitArchief(wedstrijdenVoorVideo(INDEX, t));
  assert.deepStrictEqual(ro.map((r) => [r.speler, r.tegenstander, r.offsetSec]), [
    ['Panchi Chen', 'Andy Fung', 300],
    ['Andy Fung', 'Panchi Chen', 1200],
  ]);
  assert.strictEqual(ro[0].url, 'https://youtu.be/abc123?t=300');
  assert.strictEqual(ro[0].exact, true);
});

test('runoutRacksUitNotes leest de rack-log van Cuescore', () => {
  const { runoutRacksUitNotes } = require('../src/cuescore/parse');
  const notes = [
    { note: 'frame start', time: '2026-07-22T17:25:08Z' },
    { note: 'A breaking', time: '2026-07-22T17:25:08Z' },
    { note: 'A frame win', time: '2026-07-22T17:31:52Z' },   // gewone winst, geen run-out
    { note: 'frame end', time: '2026-07-22T17:31:52Z' },
    { note: 'frame start', time: '2026-07-22T17:37:56Z' },
    { note: 'B breaking', time: '2026-07-22T17:37:56Z' },
    { note: 'B frame win runout', time: '2026-07-22T17:41:31Z' },
    { note: 'frame end', time: '2026-07-22T17:41:31Z' },
  ];
  assert.deepStrictEqual(runoutRacksUitNotes(notes), [
    { kant: 'B', start: '2026-07-22T17:37:56Z', eind: '2026-07-22T17:41:31Z', duurSec: 215 },
  ]);
  assert.deepStrictEqual(runoutRacksUitNotes([]), []);
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

test('achteraf ingetikte stand telt niet als run-out (racks van seconden)', () => {
  // Echte casus 09-02-2026: zes "run-outs" binnen 28 seconden ingetikt.
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {
    start: '2026-02-09T23:17:28Z',
    runoutsA: 3, runoutsB: 3,
    runoutRacks: [
      { kant: 'B', start: '2026-02-09T23:19:14Z', duurSec: 7 },
      { kant: 'B', start: '2026-02-09T23:19:22Z', duurSec: 0 },
      { kant: 'A', start: '2026-02-09T23:19:24Z', duurSec: 17 },
    ],
  })] };
  const uit = wedstrijdenVoorVideo(INDEX, t);
  // Er wás een rack-log, dus geen terugval op de (even onbetrouwbare) tellers.
  assert.deepStrictEqual(uit[0].runouts, []);
});

test('een snelle maar echte run-out blijft staan', () => {
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {
    start: '2026-07-22T19:00:00Z',
    runoutsA: 1,
    runoutRacks: [{ kant: 'A', start: '2026-07-22T19:04:00Z', duurSec: 47 }],
  })] };
  assert.deepStrictEqual(wedstrijdenVoorVideo(INDEX, t)[0].runouts, [
    { speler: 'Panchi Chen', offsetSec: 240, eindSec: null, clipVan: null, clipTot: null,
      url: 'https://youtu.be/abc123?t=240', exact: true },
  ]);
});

test('runoutRacksUitNotes berekent de rackduur', () => {
  const { runoutRacksUitNotes } = require('../src/cuescore/parse');
  const racks = runoutRacksUitNotes([
    { note: 'frame start', time: '2026-02-09T23:19:22.069Z' },
    { note: 'B frame win runout', time: '2026-02-09T23:19:22.284Z' },
  ]);
  assert.strictEqual(racks[0].duurSec, 0);
});

test('soortVanToernooi groepeert seizoenen en edities op serie', () => {
  const { soortVanToernooi } = require('../src/video/archief');
  assert.strictEqual(soortVanToernooi('Fluke ranking 9ball Seizoen 3  #24'), 'Fluke Ranking');
  assert.strictEqual(soortVanToernooi('MOKUM FLUKE RANKING 9BALL #11'), 'Fluke Ranking');
  assert.strictEqual(soortVanToernooi('Mokum MEGA Summer Ranking #24'), 'MEGA Summer Ranking');
  assert.strictEqual(soortVanToernooi('MEGA Ranking i.s.m. Buffalo #37'), 'MEGA Ranking');
  assert.strictEqual(soortVanToernooi("'GO Customs' Amsterdam open @ Mokum Final day"), 'Amsterdam Open');
  assert.strictEqual(soortVanToernooi('KNBB derde divisie'), 'Overig');
});

test('elke archiefregel krijgt de soort mee', () => {
  const t = { name: 'X', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {})] };
  const rec = { ...INDEX, tournamentName: 'Fluke ranking 9ball Seizoen 2 #13' };
  assert.strictEqual(wedstrijdenVoorVideo(rec, t)[0].soort, 'Fluke Ranking');
});

test('clipvenster telt terug vanaf het einde van het rack', () => {
  // Rack van 10 min: alleen de laatste 150s + 4s naloop is interessant (de rest is opzetten).
  const lang = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {
    start: '2026-07-22T19:00:00Z', runoutsA: 1,
    runoutRacks: [{ kant: 'A', start: '2026-07-22T19:00:00Z', eind: '2026-07-22T19:10:00Z', duurSec: 600 }],
  })] };
  const a = wedstrijdenVoorVideo(INDEX, lang)[0].runouts[0];
  assert.deepStrictEqual([a.offsetSec, a.eindSec, a.clipVan, a.clipTot], [0, 600, 450, 604]);

  // Kort rack (2 min): helemaal meenemen, niets te trimmen.
  const kort = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {
    start: '2026-07-22T19:00:00Z', runoutsA: 1,
    runoutRacks: [{ kant: 'A', start: '2026-07-22T19:00:00Z', eind: '2026-07-22T19:02:00Z', duurSec: 120 }],
  })] };
  const b = wedstrijdenVoorVideo(INDEX, kort)[0].runouts[0];
  assert.deepStrictEqual([b.clipVan, b.clipTot], [0, 124]);
});

test('zonder rack-einde is er geen clipvenster (niet af te spelen)', () => {
  const t = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', { runoutsA: 1 })] };
  const r = wedstrijdenVoorVideo(INDEX, t)[0].runouts[0];
  assert.deepStrictEqual([r.exact, r.clipVan, r.clipTot], [false, null, null]);
});
