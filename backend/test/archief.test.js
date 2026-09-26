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
    speler: 'Chris Jones', offsetSec: 2250, eindSec: 2460, clipVan: 2280, clipTot: 2464,
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

test('clipvenster: kort rack heel (met afstoot), lang rack de laatste 3 min', () => {
  // Rack van 10 min > 3 min → tel 3 min terug vanaf de laatste bal (600 - 180 = 420).
  const lang = { name: 'T', matches: [wedstrijd(3, 'Panchi Chen', 'Andy Fung', {
    start: '2026-07-22T19:00:00Z', runoutsA: 1,
    runoutRacks: [{ kant: 'A', start: '2026-07-22T19:00:00Z', eind: '2026-07-22T19:10:00Z', duurSec: 600 }],
  })] };
  const a = wedstrijdenVoorVideo(INDEX, lang)[0].runouts[0];
  assert.deepStrictEqual([a.offsetSec, a.eindSec, a.clipVan, a.clipTot], [0, 600, 420, 604]);

  // Rack van 2 min < 3 min → helemaal, inclusief de afstoot bij 0.
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

// --- #140: hernoemde spelers mogen niet uit het archief vallen ---------------------------

function wm(id, tafel, a, b, start, ronde = 'Round 1') {
  return {
    matchId: id, table: String(tafel), roundName: ronde, start,
    playerA: { name: a }, playerB: { name: b }, scoreA: 5, scoreB: 3,
    runoutsA: 0, runoutsB: 0, runoutRacks: [],
  };
}

const T = (min) => new Date(Date.parse('2026-09-16T19:00:00Z') + min * 60000).toISOString();

test('#140 nieuwe records: koppelen op matchId, ook als beide spelers zijn hernoemd', () => {
  const rec = {
    videoId: 'v1', tableNumber: 1, datum: '2026-09-16',
    hoofdstukken: [{ offsetSec: 0, spelers: ['Oude Naam A', 'Oude Naam B'], matchId: 501 }],
  };
  const t = { name: 'T', matches: [wm(501, 1, 'Nieuwe Naam A', 'Nieuwe Naam B', T(0))] };
  const uit = wedstrijdenVoorVideo(rec, t);
  assert.strictEqual(uit.length, 1);
  assert.strictEqual(uit[0].offsetSec, 0);
  // De regel toont de HUIDIGE namen uit Cuescore.
  assert.deepStrictEqual(uit[0].spelers, ['Nieuwe Naam A', 'Nieuwe Naam B']);
});

test('#140 oude records zonder matchId: hernoemde speler tussen twee ankers wordt op volgorde gekoppeld', () => {
  const rec = {
    videoId: 'v2', tableNumber: 1, datum: '2026-09-16',
    hoofdstukken: [
      { offsetSec: 0, spelers: ['Anna', 'Bert'] },
      { offsetSec: 1800, spelers: ['Luuk Van den herik', 'Cees'] }, // oude naam
      { offsetSec: 3600, spelers: ['Dirk', 'Eva'] },
    ],
  };
  const t = { name: 'T', matches: [
    wm(1, 1, 'Anna', 'Bert', T(0)),
    wm(2, 1, 'Luuk. h', 'Cees', T(30)), // hernoemd
    wm(3, 1, 'Dirk', 'Eva', T(60)),
  ] };
  const uit = wedstrijdenVoorVideo(rec, t);
  assert.strictEqual(uit.length, 3);
  assert.strictEqual(uit.find((u) => u.spelers.includes('Luuk. h')).offsetSec, 1800);
});

test('#140 volgorde-terugval: alleen als het aantal onbekende hoofdstukken en wedstrijden gelijk is', () => {
  const rec = {
    videoId: 'v3', tableNumber: 1, datum: '2026-09-16',
    hoofdstukken: [
      { offsetSec: 0, spelers: ['Anna', 'Bert'] },
      { offsetSec: 1800, spelers: ['Oud X', 'Cees'] },
      { offsetSec: 3600, spelers: ['Dirk', 'Eva'] },
    ],
  };
  // Twee onbekende wedstrijden tussen de ankers, maar één onbekend hoofdstuk: te onzeker.
  const t = { name: 'T', matches: [
    wm(1, 1, 'Anna', 'Bert', T(0)),
    wm(2, 1, 'Nieuw X', 'Cees', T(20)),
    wm(4, 1, 'Nieuw Y', 'Zoë', T(40)),
    wm(3, 1, 'Dirk', 'Eva', T(60)),
  ] };
  const uit = wedstrijdenVoorVideo(rec, t);
  assert.deepStrictEqual(uit.map((u) => u.spelers[0]).sort(), ['Anna', 'Dirk']);
});

test('#140 volgorde-terugval aan het begin en einde van de video', () => {
  const rec = {
    videoId: 'v4', tableNumber: 1, datum: '2026-09-16',
    hoofdstukken: [
      { offsetSec: 0, spelers: ['Oud A', 'Bert'] },
      { offsetSec: 1800, spelers: ['Cees', 'Dirk'] },
      { offsetSec: 3600, spelers: ['Eva', 'Oud F'] },
    ],
  };
  const t = { name: 'T', matches: [
    wm(1, 1, 'Nieuw A', 'Bert', T(0)),
    wm(2, 1, 'Cees', 'Dirk', T(30)),
    wm(3, 1, 'Eva', 'Nieuw F', T(60)),
  ] };
  const uit = wedstrijdenVoorVideo(rec, t);
  assert.strictEqual(uit.length, 3);
  assert.deepStrictEqual(uit.map((u) => u.offsetSec).sort((x, y) => x - y), [0, 1800, 3600]);
});

test('#140 een hoofdstuk wordt nooit aan twee wedstrijden gekoppeld', () => {
  const rec = {
    videoId: 'v5', tableNumber: 1, datum: '2026-09-16',
    hoofdstukken: [{ offsetSec: 0, spelers: ['Anna', 'Bert'], matchId: 1 }],
  };
  const t = { name: 'T', matches: [
    wm(1, 1, 'Anna', 'Bert', T(0)),
    wm(2, 1, 'Anna', 'Bert', T(90)), // zelfde paar, latere ronde
  ] };
  assert.strictEqual(wedstrijdenVoorVideo(rec, t).length, 1);
});

test('#140 geen enkel anker en ongelijke aantallen: niets koppelen (veilige kant)', () => {
  const rec = { videoId: 'v6', tableNumber: 1, hoofdstukken: [{ offsetSec: 0, spelers: ['Oud', 'Oud2'] }] };
  const t = { name: 'T', matches: [wm(1, 1, 'A', 'B', T(0)), wm(2, 1, 'C', 'D', T(30))] };
  assert.deepStrictEqual(wedstrijdenVoorVideo(rec, t), []);
});
