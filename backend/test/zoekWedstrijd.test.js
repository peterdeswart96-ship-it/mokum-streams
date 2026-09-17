const test = require('node:test');
const assert = require('node:assert');
const { vindWedstrijd, zoekCompetitieWedstrijd, heeftTeams } = require('../src/mokumCompetitie/zoekWedstrijd');

// Teams opzoeken via matchId als de wizard ze niet meestuurde (v0.61, test 17-09).

const toernooi = (matches) => ({ matches });
const m = (matchId, a, b) => ({ matchId, status: 'waiting', playerA: { name: a }, playerB: { name: b } });

test('vindt de wedstrijd, met niveau van het toernooi en playerA als thuisteam', () => {
  const r = vindWedstrijd([
    { niveau: 'Tweede Klasse', tournament: toernooi([m(1, 'X', 'Y')]) },
    { niveau: 'Eerste Klasse', tournament: toernooi([m(88251124, 'Mokum Mayhem', 'Restless')]) },
  ], '88251124');
  assert.deepStrictEqual({ ...r, match: undefined }, { niveau: 'Eerste Klasse', thuisteam: 'Mokum Mayhem', uitteam: 'Restless', match: undefined });
});

test('niet gevonden of lege toernooien → null', () => {
  assert.strictEqual(vindWedstrijd([{ niveau: 'Eerste Klasse', tournament: null }], 5), null);
  assert.strictEqual(vindWedstrijd([], 5), null);
});

test('zoeken: begint bij het bekende niveau, slaat een falend toernooi over', async () => {
  const gevraagd = [];
  const haal = async (id) => {
    gevraagd.push(id);
    if (id === 83574424) throw new Error('Cuescore even weg');
    if (id === 83574403) return toernooi([m(42, 'Moko Loco', 'MRE')]);
    return toernooi([]);
  };
  const r = await zoekCompetitieWedstrijd(42, { niveau: 'Derde Klasse', haalToernooi: haal });
  assert.strictEqual(gevraagd[0], 83574403);
  assert.strictEqual(r.niveau, 'Derde Klasse');
  assert.strictEqual(r.thuisteam, 'Moko Loco');
  assert.strictEqual(await zoekCompetitieWedstrijd(999, { haalToernooi: haal }), null);
});

test('heeftTeams: alleen compleet met niveau en beide teams', () => {
  assert.strictEqual(heeftTeams({ niveau: 'Eerste Klasse', thuisteam: 'A', uitteam: 'B' }), true);
  assert.strictEqual(heeftTeams({ thuisteam: 'A', uitteam: 'B' }), false);
  assert.strictEqual(heeftTeams({ matchId: 1 }), false);
  assert.strictEqual(heeftTeams(null), false);
});
