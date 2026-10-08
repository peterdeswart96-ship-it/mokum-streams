const test = require('node:test');
const assert = require('node:assert/strict');
const { vandaagUitLijst, metDetails, competitieVoorLive } = require('../src/mokumCompetitie/vandaag');

const NU = new Date('2026-10-07T12:00:00Z');
const w = (id, starttime) => ({ matchId: id, starttime, teams: [{ teamSlug: 'moko-loco', teamName: 'Moko Loco' }], niveau: 'Derde Klasse', thuisteam: 'A', uitteam: 'B' });

test('vandaagUitLijst: alleen wedstrijden van de huidige zaal-dag', () => {
  const lijst = [w(1, '2026-10-07T18:00:00Z'), w(2, '2026-10-08T18:00:00Z'), w(3, '2026-10-06T18:00:00Z'), w(4, 'kapot')];
  assert.deepEqual(vandaagUitLijst(lijst, NU).map((x) => x.matchId), [1]);
});

test('vandaagUitLijst: een wedstrijd na middernacht telt nog voor de dag ervoor', () => {
  const lijst = [w(1, '2026-10-07T22:30:00Z')]; // 00:30 Nederlandse tijd op 08-10
  assert.equal(vandaagUitLijst(lijst, NU).length, 1);
});

test('metDetails: spelers, aanvoerder en agenda-link', () => {
  const detail = {
    competitionName: 'Pool Noord-Holland Derde Klasse 2026/2027', venueName: 'Mokum Pool & Darts', venueAddress: 'Nobelweg 2',
    home: { name: 'Moko Loco', roster: { captain: { name: 'Ray L' }, members: [{ name: 'Martin' }, { name: 'Ray L' }] } },
    away: { name: 'Smokum', roster: { members: [{ name: 'Ties' }] } },
  };
  const r = metDetails(w(88259410, '2026-10-07T18:00:00Z'), detail);
  assert.deepEqual(r.home, { name: 'Moko Loco', aanvoerder: 'Ray L', spelers: ['Martin', 'Ray L'] });
  assert.deepEqual(r.away, { name: 'Smokum', aanvoerder: null, spelers: ['Ties'] });
  assert.equal(r.agendaUrl, 'https://mokum-competitie.pdscloud.nl/#/wedstrijd/moko-loco/88259410');
  assert.equal(r.competitionName, 'Pool Noord-Holland Derde Klasse 2026/2027');
});

test('metDetails: zonder detail blijft de wedstrijd staan met home/away null', () => {
  const r = metDetails(w(5, '2026-10-07T18:00:00Z'), null);
  assert.equal(r.home, null);
  assert.equal(r.away, null);
  assert.equal(r.matchId, 5);
});

test('maakCache: binnen de TTL komt het bewaarde antwoord, daarna wordt opnieuw opgehaald', async () => {
  const { maakCache } = require('../src/mokumCompetitie/vandaag');
  const cache = maakCache(10 * 60 * 1000);
  let aanroepen = 0;
  const ophalen = async () => ({ n: ++aanroepen });
  const t0 = new Date('2026-10-07T12:00:00Z');
  assert.equal((await cache('2026-10-07', t0, ophalen)).n, 1);
  assert.equal((await cache('2026-10-07', new Date(t0.getTime() + 9 * 60 * 1000), ophalen)).n, 1);
  assert.equal((await cache('2026-10-07', new Date(t0.getTime() + 11 * 60 * 1000), ophalen)).n, 2);
  assert.equal(aanroepen, 2);
});

test('maakCache: een nieuwe zaal-dag en een mislukte aanroep worden niet gedeeld/bewaard', async () => {
  const { maakCache } = require('../src/mokumCompetitie/vandaag');
  const cache = maakCache(10 * 60 * 1000);
  const t0 = new Date('2026-10-07T12:00:00Z');
  await cache('2026-10-07', t0, async () => ({ n: 1 }));
  assert.equal((await cache('2026-10-08', t0, async () => ({ n: 2 }))).n, 2); // andere dag = opnieuw
  await assert.rejects(cache('2026-10-09', t0, async () => { throw new Error('stuk'); }));
  assert.equal((await cache('2026-10-08', t0, async () => ({ n: 3 }))).n, 2);  // fout liet de oude staan
});

test('competitieVoorLive: toernooiId erbij, onbekend niveau valt af', () => {
  const lijst = [
    { matchId: 88259413, niveau: 'Derde Klasse', thuisteam: 'Running English', uitteam: 'Sixpack', starttime: '2026-10-08T18:00:00Z', extra: 'x' },
    { matchId: 5, niveau: 'Onbekende klasse', thuisteam: 'A', uitteam: 'B' },
  ];
  assert.deepEqual(competitieVoorLive(lijst), [
    { matchId: 88259413, niveau: 'Derde Klasse', toernooiId: 83574403, thuisteam: 'Running English', uitteam: 'Sixpack', starttime: '2026-10-08T18:00:00Z' },
  ]);
  assert.deepEqual(competitieVoorLive(null), []);
});
