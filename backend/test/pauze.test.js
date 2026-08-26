const test = require('node:test');
const assert = require('node:assert');
const { tafelSpeeltNu, volgendeToestand, pauzeCommandos, bouwLiveMatches, telZaalLive } = require('../src/planning/pauze');

// Mini genormaliseerd toernooi (zoals normalizeTournament levert).
const toernooiMet = (matches) => ({ id: 1, name: 'T', status: 'Active', finished: false, matches });
const match = (table, status) => ({ matchId: 1, status, table: String(table), roundName: '', playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 0, scoreB: 0 });

test('tafelSpeeltNu: true bij een lopende wedstrijd op de tafel, anders false', () => {
  const ts = [toernooiMet([match(3, 'playing'), match(1, 'finished')])];
  assert.strictEqual(tafelSpeeltNu(ts, 3), true);
  assert.strictEqual(tafelSpeeltNu(ts, 1), false); // wel een match, maar finished
  assert.strictEqual(tafelSpeeltNu(ts, 15), false); // geen match
  assert.strictEqual(tafelSpeeltNu([], 3), false);
});

test('volgendeToestand: wedstrijd speelt → direct spelen als er geen wachttijd is ingesteld', () => {
  // vanuit pauze weer spelen zodra er een match is (standaard: geen vertraging)
  const r = volgendeToestand({ toestand: 'pauze', sinds: 0, wachtSinds: null }, true, 40000, 20000);
  assert.strictEqual(r.toestand, 'spelen');
  assert.strictEqual(r.veranderd, true);
});

// De tafel is toegewezen, maar de spelers moeten er nog heen lopen en racken. Het
// pauzescherm blijft daarom nog een minuut staan — anders kijk je naar een lege tafel.
test('pauzescherm blijft staan tot de wachttijd voorbij is', () => {
  const pauze = { toestand: 'pauze', sinds: 0, wachtSinds: null };
  // t=100000: Cuescore meldt een wedstrijd → nog nét niet omschakelen, wachttimer start
  const a = volgendeToestand(pauze, true, 100000, 20000, 60000);
  assert.strictEqual(a.toestand, 'pauze');
  assert.strictEqual(a.veranderd, false);
  assert.strictEqual(a.wachtSinds, 100000);

  // t=130000 (30s later): nog steeds wachten
  const b = volgendeToestand(a, true, 130000, 20000, 60000);
  assert.strictEqual(b.toestand, 'pauze');
  assert.strictEqual(b.veranderd, false);

  // t=160000 (60s later): nu pas het pauzescherm weg
  const c = volgendeToestand(b, true, 160000, 20000, 60000);
  assert.strictEqual(c.toestand, 'spelen');
  assert.strictEqual(c.veranderd, true);
});

test('valse start tijdens de wachttijd zet het pauzescherm niet aan en uit', () => {
  // Wedstrijd verschijnt, verdwijnt weer (bijv. verkeerde tafeltoewijzing), komt terug.
  const pauze = { toestand: 'pauze', sinds: 0, wachtSinds: null };
  const a = volgendeToestand(pauze, true, 100000, 20000, 60000);   // wachttimer start
  const b = volgendeToestand(a, false, 110000, 20000, 60000);      // weer weg
  assert.strictEqual(b.toestand, 'pauze');
  assert.strictEqual(b.veranderd, false);
  // Er is geen enkele omschakeling geweest: het scherm heeft niet geflikkerd.
  assert.strictEqual(a.veranderd, false);
});

test('volgendeToestand: match eindigt → pas naar pauze na debounce', () => {
  // t=1000: match net weg, prev=spelen → nog spelen, wachttimer start
  const a = volgendeToestand({ toestand: 'spelen', sinds: 0, wachtSinds: null }, false, 1000, 20000);
  assert.strictEqual(a.toestand, 'spelen');
  assert.strictEqual(a.veranderd, false);
  assert.strictEqual(a.wachtSinds, 1000);

  // t=25000: 24s geen match >= 20s debounce → pauze
  const b = volgendeToestand(a, false, 25000, 20000);
  assert.strictEqual(b.toestand, 'pauze');
  assert.strictEqual(b.veranderd, true);
});

test('volgendeToestand: blijft pauze zolang er geen wedstrijd is (geen dubbele omschakeling)', () => {
  const r = volgendeToestand({ toestand: 'pauze', sinds: 25000, wachtSinds: null }, false, 60000, 20000);
  assert.strictEqual(r.toestand, 'pauze');
  assert.strictEqual(r.veranderd, false);
});

// #113-achtig, geconstateerd 25-08: het pauzescherm hoort "tot de eerste bal valt" te
// draaien. Een verse tafel (geen vorige staat) moet dus in PAUZE beginnen — niet stil
// aannemen dat 'spelen' klopt totdat het tegendeel bewezen is.
test('volgendeToestand: eerste run zonder vorige → start neutraal in pauze', () => {
  const r = volgendeToestand(null, false, 5000, 20000);
  assert.strictEqual(r.toestand, 'pauze');
  assert.strictEqual(r.veranderd, false);
});

test('volgendeToestand: eerste run zonder vorige, maar er speelt al iets → direct actief naar spelen (geen wachttijd ingesteld)', () => {
  const r = volgendeToestand(null, true, 5000, 20000);
  assert.strictEqual(r.toestand, 'spelen');
  assert.strictEqual(r.veranderd, true);
});

test('volgendeToestand: eerste run zonder vorige, er speelt al iets, mét wachttijd → pas na de wachttijd naar spelen', () => {
  const a = volgendeToestand(null, true, 5000, 20000, 60000);
  assert.strictEqual(a.toestand, 'pauze');
  assert.strictEqual(a.veranderd, false);
  assert.strictEqual(a.wachtSinds, 5000);

  const b = volgendeToestand(a, true, 65000, 20000, 60000);
  assert.strictEqual(b.toestand, 'spelen');
  assert.strictEqual(b.veranderd, true);
});

// Vaste "nu" voor de weergavefuncties: 02-08-2026 14:00 Amsterdam. Sinds #86 hangt de
// keuze van een afgeronde wedstrijd af van de zaal-dag, dus de fixtures moeten een
// starttijd hebben — anders zou de test op de ene dag slagen en op de andere niet.
const NU = new Date('2026-08-02T12:00:00Z');
const VANDAAG = '2026-08-02T10:00:00Z';

test('bouwLiveMatches: per tafel de lopende wedstrijd (of laatste), anders null', () => {
  const ts = [toernooiMet([
    { matchId: 1, status: 'playing', table: '3', roundName: 'R1', start: VANDAAG, playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 4, scoreB: 1 },
    { matchId: 2, status: 'finished', table: '1', roundName: 'Finale', start: VANDAAG, playerA: { name: 'C' }, playerB: { name: 'D' }, scoreA: 7, scoreB: 5 },
  ])];
  const r = bouwLiveMatches(ts, [1, 3, 15], NU);
  assert.deepStrictEqual(r['3'], { playerA: 'A', playerB: 'B', scoreA: 4, scoreB: 1, status: 'playing', round: 'R1' });
  assert.deepStrictEqual(r['1'], { playerA: 'C', playerB: 'D', scoreA: 7, scoreB: 5, status: 'finished', round: 'Finale' });
  assert.strictEqual(r['15'], null); // geen wedstrijd op tafel 15
});

test('telZaalLive: telt alle lopende wedstrijden over alle toernooien (case-ongevoelig)', () => {
  const ts = [
    toernooiMet([match(3, 'playing'), match(1, 'finished'), match(15, 'Playing')]),
    toernooiMet([match(5, 'waiting'), match(7, 'playing')]),
  ];
  assert.strictEqual(telZaalLive(ts), 3); // tafel 3, 15, 7
  assert.strictEqual(telZaalLive([]), 0);
  assert.strictEqual(telZaalLive(null), 0);
});

test('pauzeCommandos: schakelt de pauze-overlays op de gewenste stand, onbekende sleutels overslaan', () => {
  const bron = { jumbotron: 'Jumbotron', pauzemelding: 'Pauzemelding', sponsors: 'Sponsor slideshow' };
  const aan = pauzeCommandos(3, true, bron, ['jumbotron', 'pauzemelding', 'bestaatniet']);
  assert.deepStrictEqual(aan, [
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Jumbotron', enabled: true },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Pauzemelding', enabled: true },
  ]);
  const uit = pauzeCommandos(3, false, bron, ['jumbotron', 'pauzemelding']);
  assert.ok(uit.every((c) => c.enabled === false));
});

test('bouwZaalRaster: alle tafels met een wedstrijd, lopende wint, gesorteerd op tafelnummer', () => {
  const { bouwZaalRaster } = require('../src/planning/pauze');
  const ts = [
    { name: 'Ranking A', matches: [
      { matchId: 1, status: 'finished', table: '3', roundName: 'R1', start: VANDAAG, playerA: { name: 'Oud' }, playerB: { name: 'X' }, scoreA: 7, scoreB: 2 },
      { matchId: 2, status: 'playing',  table: '3', roundName: 'R2', start: VANDAAG, playerA: { name: 'Nu' },  playerB: { name: 'Y' }, scoreA: 1, scoreB: 0 },
      { matchId: 3, status: 'playing',  table: '15', roundName: 'R1', start: VANDAAG, playerA: { name: 'P', image: 'https://img/p.png', flag: 'https://flag/nl.png' },  playerB: { name: 'Q' }, scoreA: 3, scoreB: 3 },
      { matchId: 4, status: 'pending',  table: null, roundName: '', start: VANDAAG, playerA: { name: 'Z' }, playerB: { name: 'W' }, scoreA: 0, scoreB: 0 },
    ] },
    { name: 'Ranking B', matches: [
      { matchId: 5, status: 'finished', table: '1', roundName: 'Finale', start: VANDAAG, playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 5, scoreB: 7 },
    ] },
  ];
  const r = bouwZaalRaster(ts, NU);
  assert.deepStrictEqual(r.map((x) => x.table), [1, 3, 15]); // gesorteerd, tafel=null valt weg
  const t3 = r.find((x) => x.table === 3);
  assert.strictEqual(t3.status, 'playing');   // lopende wint van afgeronde
  assert.strictEqual(t3.playerA.name, 'Nu');
  assert.strictEqual(t3.scoreA, 1);
  const t1 = r.find((x) => x.table === 1);
  assert.strictEqual(t1.status, 'finished');  // geen lopende → afgeronde tonen
  assert.strictEqual(t1.tournament, 'Ranking B');
  const t15 = r.find((x) => x.table === 15);
  assert.strictEqual(t15.playerA.image, 'https://img/p.png'); // foto doorgegeven
  assert.strictEqual(t15.playerA.flag, 'https://flag/nl.png'); // vlag doorgegeven
  assert.strictEqual(t15.playerB.image, null); // ontbrekende foto → null
});

test('bouwZaalRaster: lege/ongeldige invoer → lege lijst', () => {
  const { bouwZaalRaster } = require('../src/planning/pauze');
  assert.deepStrictEqual(bouwZaalRaster([]), []);
  assert.deepStrictEqual(bouwZaalRaster(null), []);
  assert.deepStrictEqual(bouwZaalRaster([{ name: 'x', matches: [] }]), []);
});

test('refreshCommandos: bouwt refreshSource per bekende sleutel, slaat onbekende over', () => {
  const { refreshCommandos } = require('../src/planning/pauze');
  const bron = { scoreboard: 'Scoreboard', jumbotron: 'Jumbotron' };
  assert.deepStrictEqual(refreshCommandos(3, bron, ['scoreboard', 'onbekend']), [
    { type: 'refreshSource', tableNumber: 3, sourceName: 'Scoreboard' },
  ]);
  assert.deepStrictEqual(refreshCommandos(3, bron, []), []);
});

// --- #86: geen wedstrijden van weken geleden op het dashboard ---
//
// Sinds de doorlopende 14.1-league meekomt in "toernooien van vandaag" zitten er
// partijen van maanden terug in de data (16 juni t/m 31 augustus, 88 gespeeld over
// zestien tafels). Op 02-08 toonde het dashboard daardoor "Bob Walter vs Marieke de
// Boer" van 21 JUNI als de huidige stand op tafel 16, en vulde het zaalraster van het
// pauzescherm zich met oude partijen.

test('#86: een afgelopen wedstrijd van weken terug telt niet meer mee', () => {
  const { bouwLiveMatches } = require('../src/planning/pauze');
  const league = toernooiMet([
    { matchId: 1, status: 'finished', table: '16', roundName: 'Round 6', start: '2026-06-21T10:41:00Z',
      playerA: { name: 'Bob Walter' }, playerB: { name: 'Marieke de Boer' }, scoreA: 25, scoreB: 75 },
  ]);
  assert.strictEqual(bouwLiveMatches([league], [16], NU)['16'], null);
});

test('#86: een afgelopen wedstrijd van vandaag telt wél mee', () => {
  const { bouwLiveMatches } = require('../src/planning/pauze');
  const league = toernooiMet([
    { matchId: 1, status: 'finished', table: '3', roundName: 'Round 7', start: '2026-08-02T09:15:00Z',
      playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 100, scoreB: 60 },
  ]);
  assert.strictEqual(bouwLiveMatches([league], [3], NU)['3'].playerA, 'A');
});

test('#86: een LOPENDE wedstrijd telt altijd, ook zonder starttijd', () => {
  const { bouwLiveMatches } = require('../src/planning/pauze');
  const t = toernooiMet([
    { matchId: 1, status: 'playing', table: '1', roundName: 'R1', playerA: { name: 'X' }, playerB: { name: 'Y' } },
  ]);
  assert.strictEqual(bouwLiveMatches([t], [1], NU)['1'].playerA, 'X');
});

// De league zet de partijen niet op chronologische volgorde in de lijst. Filteren mag dus
// pas ná het kiezen niet gebeuren: dan pakt "de laatste op deze tafel" een partij van juni,
// valt die af, en blijft de tafel leeg terwijl er vandaag wél gespeeld is.
test('#86: de partij van vandaag wordt gevonden, ook als er een oudere achter staat', () => {
  const { bouwLiveMatches } = require('../src/planning/pauze');
  const league = toernooiMet([
    { matchId: 1, status: 'finished', table: '1', roundName: 'R7', start: '2026-08-02T09:00:00Z',
      playerA: { name: 'vandaag' }, playerB: { name: 'ook vandaag' }, scoreA: 100, scoreB: 44 },
    { matchId: 2, status: 'finished', table: '1', roundName: 'R3', start: '2026-07-02T15:11:00Z',
      playerA: { name: 'Danny Bast' }, playerB: { name: 'Sander Vriens' }, scoreA: 60, scoreB: 100 },
  ]);
  assert.strictEqual(bouwLiveMatches([league], [1], NU)['1'].playerA, 'vandaag');
});

test('#86: bij twee partijen van vandaag op één tafel wint de laatst gestarte', () => {
  const { bouwLiveMatches } = require('../src/planning/pauze');
  const league = toernooiMet([
    { matchId: 1, status: 'finished', table: '1', start: '2026-08-02T09:00:00Z', playerA: { name: 'ochtend' }, playerB: { name: 'x' } },
    { matchId: 2, status: 'finished', table: '1', start: '2026-08-02T11:30:00Z', playerA: { name: 'net klaar' }, playerB: { name: 'y' } },
  ]);
  assert.strictEqual(bouwLiveMatches([league], [1], NU)['1'].playerA, 'net klaar');
});

test('#86: het zaalraster toont alleen wat er vandaag speelt of gespeeld is', () => {
  const { bouwZaalRaster } = require('../src/planning/pauze');
  const league = toernooiMet([
    { matchId: 1, status: 'finished', table: '16', start: '2026-06-21T10:41:00Z', playerA: { name: 'oud' }, playerB: { name: 'oud2' } },
    { matchId: 2, status: 'finished', table: '3', start: '2026-08-02T09:15:00Z', playerA: { name: 'vandaag' }, playerB: { name: 'vandaag2' } },
    { matchId: 3, status: 'playing', table: '7', playerA: { name: 'speelt' }, playerB: { name: 'speelt2' } },
  ]);
  const r = bouwZaalRaster([league], NU);
  assert.deepStrictEqual(r.map((x) => x.table), [3, 7]);
});
