const test = require('node:test');
const assert = require('node:assert');
const { wedstrijdenBijMokum, competitieTitel } = require('../src/mokumCompetitie/bijMokum');

// Tests voor de wedstrijdlijst van de competitie-wizard (#120). Vormen zoals de
// mokum-competitie-API ze op 17-09 teruggaf.

const ZAAL = 'Mokum Pool & Darts';
// Vast moment vóór alle testwedstrijden, zodat "vanaf vandaag" ze niet wegfiltert.
const VROEG = new Date('2026-09-01T12:00:00Z');

function team(teamSlug, teamName, niveau = 'Derde Klasse', niveauCategorie = 'Klasse') {
  return { teamSlug, teamName, niveau, niveauCategorie };
}
function wedstrijd(matchId, { isHome, opponent, venueName = ZAAL, starttime = '2026-09-22T18:00:00Z' }) {
  return {
    matchId, matchUrl: `https://cuescore.com/match/${matchId}`, roundName: 'Round 2',
    starttime, isHome, opponent, venueName, matchStatus: 'waiting',
  };
}

test('alleen wedstrijden bij Mokum, op venueName — een uitwedstrijd valt weg', () => {
  const lijst = wedstrijdenBijMokum([{
    team: team('moko-loco', 'Moko Loco'),
    matches: [
      wedstrijd(1, { isHome: true, opponent: 'MRE' }),
      wedstrijd(2, { isHome: false, opponent: 'Wartburgia', venueName: 'Poollokaal De Gracht' }),
    ],
  }], VROEG);
  assert.deepStrictEqual(lijst.map((w) => w.matchId), [1]);
});

test('isHome: false bij Mokum blijft staan (niet filteren op isHome)', () => {
  const lijst = wedstrijdenBijMokum([{
    team: team('moko-loco', 'Moko Loco'),
    matches: [wedstrijd(88259371, { isHome: false, opponent: 'Mokum Sixpack' })],
  }], VROEG);
  assert.strictEqual(lijst.length, 1);
  assert.strictEqual(lijst[0].thuisteam, 'Mokum Sixpack');
  assert.strictEqual(lijst[0].uitteam, 'Moko Loco');
});

test('onderlinge wedstrijd staat één keer in de lijst, met beide teams', () => {
  const lijst = wedstrijdenBijMokum([
    { team: team('moko-loco', 'Moko Loco'), matches: [wedstrijd(7, { isHome: false, opponent: 'Mokum Sixpack (CS)' })] },
    { team: team('mokum-sixpack', 'Mokum Sixpack'), matches: [wedstrijd(7, { isHome: true, opponent: 'Moko Loco (CS)' })] },
  ], VROEG);
  assert.strictEqual(lijst.length, 1);
  assert.deepStrictEqual(lijst[0].teams.map((t) => t.teamSlug), ['moko-loco', 'mokum-sixpack']);
  // Beide namen zoals wij ze kennen, niet de Cuescore-variant van de tegenstander.
  assert.strictEqual(lijst[0].thuisteam, 'Mokum Sixpack');
  assert.strictEqual(lijst[0].uitteam, 'Moko Loco');
});

test('gesorteerd op starttime, niveau komt van het team', () => {
  const lijst = wedstrijdenBijMokum([
    { team: team('a', 'A', 'Eredivisie', 'Eredivisie'), matches: [wedstrijd(1, { isHome: true, opponent: 'X', starttime: '2026-10-01T18:00:00Z' })] },
    { team: team('b', 'B'), matches: [wedstrijd(2, { isHome: true, opponent: 'Y', starttime: '2026-09-23T18:00:00Z' })] },
  ], VROEG);
  assert.deepStrictEqual(lijst.map((w) => w.matchId), [2, 1]);
  assert.strictEqual(lijst[1].niveau, 'Eredivisie');
  assert.strictEqual(lijst[1].niveauCategorie, 'Eredivisie');
});

test('lege of ontbrekende invoer geeft een lege lijst', () => {
  assert.deepStrictEqual(wedstrijdenBijMokum([], VROEG), []);
  assert.deepStrictEqual(wedstrijdenBijMokum(undefined), []);
  assert.deepStrictEqual(wedstrijdenBijMokum([{ team: team('a', 'A'), matches: null }]), []);
});

test('titel: thuisteam vooraan, met niveau', () => {
  assert.strictEqual(
    competitieTitel({ niveau: 'Derde Klasse', thuisteam: 'Moko Loco', uitteam: 'MRE' }),
    'Derde Klasse Moko Loco vs. MRE',
  );
});

test('vanaf vandaag: een blijven hangende wedstrijd van eerder valt weg, vanavond blijft staan', () => {
  // 17-09 21:00 in de zaal. Mokumse mikmak (14-09) stond op die dag nog op "playing".
  const nu = new Date('2026-09-17T19:00:00Z');
  const lijst = wedstrijdenBijMokum([{
    team: team('a', 'A'),
    matches: [
      { ...wedstrijd(1, { isHome: true, opponent: 'X', starttime: '2026-09-14T18:00:00Z' }), matchStatus: 'playing' },
      wedstrijd(2, { isHome: true, opponent: 'Y', starttime: '2026-09-17T18:00:00Z' }),
      wedstrijd(3, { isHome: true, opponent: 'Z', starttime: '2026-09-21T18:00:00Z' }),
    ],
  }], nu);
  assert.deepStrictEqual(lijst.map((w) => w.matchId), [2, 3]);
});

test('vanaf vandaag: na middernacht telt de avond nog als dezelfde zaal-dag', () => {
  const nu = new Date('2026-09-17T23:30:00Z'); // 01:30 lokaal op 18-09
  const lijst = wedstrijdenBijMokum([{
    team: team('a', 'A'),
    matches: [wedstrijd(2, { isHome: true, opponent: 'Y', starttime: '2026-09-17T18:00:00Z' })],
  }], nu);
  assert.strictEqual(lijst.length, 1);
});
