const test = require('node:test');
const assert = require('node:assert');
const { aantalPartijen, competitieKlaarReden, competitieStopBesluit, moetCompetitieChecken } = require('../src/planning/competitieStop');
const { toernooiVoorNiveau } = require('../src/mokumCompetitie/toernooien');

// Automatische stop van een competitiestream (#145). Standen zoals Cuescore ze in
// september 2026 gaf.

const START = '2026-09-21T18:00:00Z';
const entry = (extra = {}) => ({ streamType: 'competitie', matchId: 88251091, niveau: 'Eerste Klasse', scheduledStart: START, ...extra });
const na = (min) => new Date(new Date(START).getTime() + min * 60000);
const match = (status, scoreA, scoreB) => ({ status, scoreA, scoreB });

test('aantal partijen: Klasse 6, Divisies en Eredivisie 7, onbekend null', () => {
  assert.strictEqual(aantalPartijen('Derde Klasse'), 6);
  assert.strictEqual(aantalPartijen('Eerste Divisie'), 7);
  assert.strictEqual(aantalPartijen('Derde Divisie Noord-West'), 7);
  assert.strictEqual(aantalPartijen('Eredivisie'), 7);
  assert.strictEqual(aantalPartijen('Beker'), null);
  assert.strictEqual(aantalPartijen(undefined), null);
});

test('Cuescore "finished" → klaar, ook meteen na de start', () => {
  assert.match(competitieKlaarReden(entry(), match('finished', 3, 3), na(1)), /afgerond/);
});

test('stand compleet (5-1, 3-3) na 90 minuten → klaar, ook als Cuescore nog "playing" zegt', () => {
  assert.match(competitieKlaarReden(entry(), match('playing', 5, 1), na(200)), /stand 5-1/);
  assert.match(competitieKlaarReden(entry(), match('playing', 3, 3), na(90)), /alle 6 partijen/);
});

test('stand nog niet compleet → niet klaar (Mokumse MikMak bleef op 3-2 hangen)', () => {
  assert.strictEqual(competitieKlaarReden(entry(), match('playing', 3, 2), na(300)), null);
});

test('stand compleet maar binnen 90 minuten na de start → niet klaar (rem tegen afkappen)', () => {
  assert.strictEqual(competitieKlaarReden(entry(), match('playing', 4, 2), na(89)), null);
});

test('divisie: 6 partijen is nog niet klaar, 7 wel', () => {
  const e = entry({ niveau: 'Eerste Divisie' });
  assert.strictEqual(competitieKlaarReden(e, match('playing', 3, 3), na(200)), null);
  assert.match(competitieKlaarReden(e, match('playing', 4, 3), na(200)), /alle 7 partijen/);
});

test('onbekend niveau: alleen "finished" telt, de stand niet', () => {
  const e = entry({ niveau: 'Beker' });
  assert.strictEqual(competitieKlaarReden(e, match('playing', 9, 9), na(300)), null);
  assert.match(competitieKlaarReden(e, match('finished', 1, 0), na(300)), /afgerond/);
});

test('zonder wedstrijd of met rare stand → niet klaar', () => {
  assert.strictEqual(competitieKlaarReden(entry(), null, na(300)), null);
  assert.strictEqual(competitieKlaarReden(entry(), match('playing', null, undefined), na(300)), null);
  assert.strictEqual(competitieKlaarReden(entry(), match('waiting', 0, 0), na(300)), null);
});

test('besluit: eerste signaal zet klaarSinds, stopt pas na de wachttijd', () => {
  const nu = na(200);
  const b1 = competitieStopBesluit(entry(), match('finished', 3, 3), nu);
  assert.strictEqual(b1.klaarSinds, nu.toISOString());
  assert.strictEqual(b1.stoppen, false);

  const e = entry({ competitieKlaarSinds: b1.klaarSinds, competitieKlaarReden: b1.reden });
  assert.strictEqual(competitieStopBesluit(e, null, na(204)).stoppen, false);
  const b2 = competitieStopBesluit(e, null, na(205));
  assert.strictEqual(b2.stoppen, true);
  assert.match(b2.reden, /afgerond/);
});

test('besluit: stand die na het signaal terugvalt zet de wachttijd niet opnieuw', () => {
  const e = entry({ competitieKlaarSinds: na(200).toISOString(), competitieKlaarReden: 'stand 4-2' });
  assert.strictEqual(competitieStopBesluit(e, match('playing', 4, 1), na(206)).stoppen, true);
});

test('besluit: niets klaar → niets doen', () => {
  assert.deepStrictEqual(competitieStopBesluit(entry(), match('playing', 2, 2), na(200)), { klaarSinds: null, stoppen: false, reden: null });
});

test('wachttijd instelbaar', () => {
  const e = entry({ competitieKlaarSinds: na(200).toISOString() });
  assert.strictEqual(competitieStopBesluit(e, null, na(203), { wachtMs: 3 * 60000 }).stoppen, true);
});

test('Cuescore hooguit eens per 2 minuten bevragen', () => {
  assert.strictEqual(moetCompetitieChecken(entry(), na(0)), true);
  const e = entry({ competitieLaatsteCheck: na(10).toISOString() });
  assert.strictEqual(moetCompetitieChecken(e, na(11)), false);
  assert.strictEqual(moetCompetitieChecken(e, na(12)), true);
});

test('toernooi per niveau: bekende niveaus hebben een id, onbekende niet', () => {
  assert.strictEqual(toernooiVoorNiveau('Eerste Klasse'), 83574424);
  assert.strictEqual(toernooiVoorNiveau(' Derde Divisie Noord-West '), 83574898);
  assert.strictEqual(toernooiVoorNiveau('Tweede Divisie'), null);
  assert.strictEqual(toernooiVoorNiveau(undefined), null);
});
