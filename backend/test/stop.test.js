const test = require('node:test');
const assert = require('node:assert');
const { shouldStop, stopReden, toernooiKlaar, wedstrijdSpeelt } = require('../src/planning/stop');

const NOW = new Date('2026-07-14T21:00:00Z');

test('shouldStop: enkeldaags toernooi stopt als het Finished is', () => {
  const entry = { tableNumber: 1, tournamentId: 1 };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, { finished: true }, NOW), true);
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, { finished: false }, NOW), false);
});

test('shouldStop: de eigen eindtijd (stopOverride) is het vangnet, ook zonder Cuescore-data', () => {
  const entry = { tableNumber: 1, tournamentId: 1 };
  // stopOverride in het verleden → stoppen, óók als Cuescore onbereikbaar is (tournament = null)
  assert.strictEqual(shouldStop(entry, { type: 'tournament', stopOverride: '2026-07-14T20:59:00Z' }, null, NOW), true);
  // stopOverride in de toekomst + nog niet finished → nog niet stoppen
  assert.strictEqual(shouldStop(entry, { type: 'tournament', stopOverride: '2026-07-14T23:00:00Z' }, { finished: false }, NOW), false);
});

test('#76: plannedStop (Cuescore-eindtijd) is GÉÉN stopreden meer', () => {
  const entry = { tableNumber: 1, tournamentId: 1 };
  // Cuescore vult dit veld met een plaatsvuller (23:59). Ook ruim voorbij → niet stoppen.
  assert.strictEqual(shouldStop(entry, { type: 'tournament', plannedStop: '2026-07-14T18:00:00Z' }, { finished: false }, NOW), false);
  assert.strictEqual(shouldStop(entry, { type: 'tournament', plannedStop: '2026-07-14T18:00:00Z' }, null, NOW), false);
});

test('shouldStop: ad-hoc en al gestopte streams stoppen nooit automatisch', () => {
  assert.strictEqual(shouldStop({ tableNumber: 1, adhoc: true }, {}, { finished: true }, NOW), false);
  assert.strictEqual(shouldStop({ tableNumber: 1, stopped: true }, {}, { finished: true }, NOW), false);
});

test('shouldStop: stopOverride bereikt → stoppen (ongeacht Cuescore)', () => {
  const entry = { tableNumber: 1, tournamentId: 1 };
  assert.strictEqual(shouldStop(entry, { stopOverride: '2026-07-14T20:00:00Z' }, { finished: false }, NOW), true);
  assert.strictEqual(shouldStop(entry, { stopOverride: '2026-07-14T22:00:00Z' }, { finished: false }, NOW), false);
});

test('shouldStop: competitie stopt als er vandaag geen niet-afgeronde wedstrijd meer op de tafel is', () => {
  const entry = { tableNumber: 1, tournamentId: 9 };
  const record = { type: 'competition', tafels: [1] };
  const alleKlaar = { matches: [{ table: '1', start: '2026-07-14T18:00:00Z', status: 'finished' }] };
  const nogBezig = { matches: [{ table: '1', start: '2026-07-14T20:30:00Z', status: 'scheduled' }] };
  assert.strictEqual(shouldStop(entry, record, alleKlaar, NOW), true);
  assert.strictEqual(shouldStop(entry, record, nogBezig, NOW), false);
});

test('shouldStop: enkeldaags stopt als de finale gespeeld is en de tafel geen wedstrijd meer heeft', () => {
  const NOW2 = new Date('2026-07-14T22:00:00Z');
  const entry = { tableNumber: 1 };
  // Finale klaar, en op tafel 1 staat geen niet-afgeronde wedstrijd meer vandaag.
  const tFinaleKlaar = { finished: false, matches: [
    { table: '1', start: '2026-07-14T20:00:00Z', status: 'finished', roundName: 'Final' },
  ] };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, tFinaleKlaar, NOW2), true);

  // Finale klaar, maar tafel 1 heeft nog een niet-afgeronde wedstrijd (bijv. brons) → NIET stoppen.
  const tBronsLoopt = { finished: false, matches: [
    { table: '1', start: '2026-07-14T20:00:00Z', status: 'finished', roundName: 'Final' },
    { table: '1', start: '2026-07-14T22:30:00Z', status: 'scheduled', roundName: '3rd place' },
  ] };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, tBronsLoopt, NOW2), false);

  // Finale nog niet gespeeld, geen plannedStop → nog niet stoppen.
  const tGeenFinale = { finished: false, matches: [
    { table: '1', start: '2026-07-14T20:00:00Z', status: 'finished', roundName: 'Halve finale' },
  ] };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, tGeenFinale, NOW2), false);
});

// --- Podium-grace (#54/#57): na de finale eerst het medaillescherm ~1 min tonen ---
const GRACE = 60 * 1000;
const NOW3 = new Date('2026-07-14T22:00:00Z');
const finaleKlaar = { finished: true };

test('shouldStop met grace: klaar maar nog niet gestempeld → nog niet stoppen', () => {
  const entry = { tableNumber: 1, tournamentId: 1 }; // geen finaleKlaarSinds
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, finaleKlaar, NOW3, { graceMs: GRACE }), false);
});

test('shouldStop met grace: gestempeld < 1 min geleden → nog niet stoppen (podium blijft)', () => {
  const entry = { tableNumber: 1, tournamentId: 1, finaleKlaarSinds: '2026-07-14T21:59:30Z' }; // 30s geleden
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, finaleKlaar, NOW3, { graceMs: GRACE }), false);
});

test('shouldStop met grace: gestempeld >= 1 min geleden → stoppen', () => {
  const entry = { tableNumber: 1, tournamentId: 1, finaleKlaarSinds: '2026-07-14T21:58:30Z' }; // 90s geleden
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, finaleKlaar, NOW3, { graceMs: GRACE }), true);
});

test('shouldStop met grace: de eigen eindtijd stopt direct (zonder grace)', () => {
  const entry = { tableNumber: 1, tournamentId: 1 }; // niet gestempeld
  const rec = { type: 'tournament', stopOverride: '2026-07-14T21:59:00Z' }; // voorbij
  assert.strictEqual(shouldStop(entry, rec, { finished: false }, NOW3, { graceMs: GRACE }), true);
});

test('shouldStop met grace: competitie stopt direct (geen podium-grace)', () => {
  const entry = { tableNumber: 1, tournamentId: 9 };
  const rec = { type: 'competition', tafels: [1] };
  const alleKlaar = { matches: [{ table: '1', start: '2026-07-14T18:00:00Z', status: 'finished' }] };
  assert.strictEqual(shouldStop(entry, rec, alleKlaar, NOW3, { graceMs: GRACE }), true);
});

// --- #72: overige camera-tafels sluiten zodra de finale BEGINT ---
const NOWF = new Date('2026-07-14T19:00:00Z'); // 21:00 Amsterdam, zaal-dag 2026-07-14

test('#72: finale speelt op tafel 1 → een andere camera-tafel zonder wedstrijd sluit direct', () => {
  const finalePlaying = { finished: false, matches: [
    { table: '1', status: 'playing', roundName: 'Final' },
  ] };
  // Tafel 15 heeft niets meer → sluiten, óók meteen (geen podium-grace nodig).
  assert.strictEqual(shouldStop({ tableNumber: 15 }, { type: 'tournament' }, finalePlaying, NOWF), true);
  assert.strictEqual(shouldStop({ tableNumber: 15 }, { type: 'tournament' }, finalePlaying, NOWF, { graceMs: GRACE }), true);
  // De finale-tafel zelf blijft draaien (finale nog niet afgerond).
  assert.strictEqual(shouldStop({ tableNumber: 1 }, { type: 'tournament' }, finalePlaying, NOWF), false);
});

test('#72: een tafel met nog een lopende wedstrijd (brons) blijft open tijdens de finale', () => {
  const finaleMetBrons = { finished: false, matches: [
    { table: '1', status: 'playing', roundName: 'Final' },
    { table: '15', start: '2026-07-14T19:30:00Z', status: 'scheduled', roundName: '3rd place' },
  ] };
  assert.strictEqual(shouldStop({ tableNumber: 15 }, { type: 'tournament' }, finaleMetBrons, NOWF), false);
});

test('#72: zolang de finale nog niet is begonnen (gepland), sluit er niets vervroegd', () => {
  const finaleGepland = { finished: false, matches: [
    { table: '1', status: 'scheduled', roundName: 'Final' },
  ] };
  assert.strictEqual(shouldStop({ tableNumber: 15 }, { type: 'tournament' }, finaleGepland, NOWF), false);
});

// --- #76: nooit een lopende wedstrijd afkappen (incident 27-07-2026) ---
//
// Wat er die avond gebeurde, in Amsterdamse tijd:
//   23:55:58  halve finale tafel 1 klaar
//   23:57:47  FINALE begint op tafel 1
//   23:59:00  Cuescore-eindtijd (plaatsvuller) bereikt → stream werd gestopt  ← de bug
//   00:10:00  finale afgelopen — 11 min finale + prijsuitreiking gemist
// De tijden staan hier als expliciete UTC-instants (23:59 NL = 21:59Z), zodat de test
// niet afhangt van de tijdzone van de machine waarop 'ie draait.

const FINALE_LOOPT = {
  finished: false,
  matches: [
    { table: '1', status: 'playing', roundName: 'Final', start: '2026-07-27T21:57:47Z' },
    { table: '3', status: 'finished', roundName: 'Semi final', start: '2026-07-27T21:37:10Z' },
  ],
};
const OM_2359 = new Date('2026-07-27T21:59:00Z'); // 23:59 Amsterdam

test('#76: de finale-tafel wordt niet gestopt door de Cuescore-eindtijd', () => {
  const entry = { tableNumber: 1, tournamentId: 84675238 };
  const rec = { type: 'tournament', plannedStop: '2026-07-27T21:59:00Z' }; // exact het incident
  assert.strictEqual(shouldStop(entry, rec, FINALE_LOOPT, OM_2359, { graceMs: 180000 }), false);
});

test('#76: ook een eigen eindtijd kapt een lopende wedstrijd niet af', () => {
  const entry = { tableNumber: 1, tournamentId: 84675238 };
  const rec = { type: 'tournament', stopOverride: '2026-07-27T21:58:00Z' }; // al voorbij
  assert.strictEqual(shouldStop(entry, rec, FINALE_LOOPT, OM_2359), false);
  // Zodra de finale klaar is telt die eindtijd wél weer (nachtstop blijft het laatste vangnet).
  const finaleKlaar = { finished: true, matches: [{ table: '1', status: 'finished', roundName: 'Final' }] };
  assert.strictEqual(shouldStop(entry, rec, finaleKlaar, OM_2359), true);
});

test('#76: tafel 3 sloot die avond wél terecht (finale bezig, niets meer op die tafel)', () => {
  const entry = { tableNumber: 3, tournamentId: 84675238 };
  assert.strictEqual(shouldStop(entry, { type: 'tournament' }, FINALE_LOOPT, OM_2359), true);
});

test('#76: een competitie-tafel met een lopende wedstrijd blijft open', () => {
  const entry = { tableNumber: 1, tournamentId: 9 };
  const rec = { type: 'competition', tafels: [1] };
  // Geen enkele wedstrijd staat vandaag gepland (datum-filter), maar er speelt er wél één.
  const speelt = { matches: [{ table: '1', status: 'playing', start: '2026-07-26T20:00:00Z' }] };
  assert.strictEqual(shouldStop(entry, rec, speelt, OM_2359), false);
});

test('wedstrijdSpeelt: alleen een lopende wedstrijd op déze tafel telt', () => {
  assert.strictEqual(wedstrijdSpeelt({ tableNumber: 1 }, FINALE_LOOPT), true);
  assert.strictEqual(wedstrijdSpeelt({ tableNumber: 3 }, FINALE_LOOPT), false);
  assert.strictEqual(wedstrijdSpeelt({ tableNumber: 1 }, null), false);
  assert.strictEqual(wedstrijdSpeelt({ tableNumber: 1 }, { finished: true }), false); // geen matches-array
});

test('stopReden: geeft een leesbare reden voor de log (#76)', () => {
  assert.strictEqual(stopReden({ tableNumber: 1 }, {}, FINALE_LOOPT, OM_2359), null);
  const reden = stopReden({ tableNumber: 3 }, { type: 'tournament' }, FINALE_LOOPT, OM_2359);
  assert.match(reden, /finale bezig op tafel 1/);
  const rec = { type: 'tournament', stopOverride: '2026-07-27T21:00:00Z' };
  assert.match(stopReden({ tableNumber: 3 }, rec, null, OM_2359), /eindtijd bereikt/);
});

test('toernooiKlaar: Finished óf finale-gespeeld-zonder-restwedstrijd', () => {
  const entry = { tableNumber: 1 };
  assert.strictEqual(toernooiKlaar(entry, { finished: true }, NOW3), true);
  assert.strictEqual(toernooiKlaar(entry, { finished: false, matches: [
    { table: '1', status: 'finished', roundName: 'Final' },
  ] }, NOW3), true);
  assert.strictEqual(toernooiKlaar(entry, { finished: false, matches: [
    { table: '1', status: 'finished', roundName: 'Semi final' },
  ] }, NOW3), false);
  assert.strictEqual(toernooiKlaar(entry, null, NOW3), false);
});
