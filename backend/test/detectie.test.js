const test = require('node:test');
const assert = require('node:assert');
const { spelsoortVanDiscipline, sponsorVanNaam, schoneTitel, templateVoorToernooi, datumThumb } = require('../src/video/detectie');

test('spelsoortVanDiscipline: standaard disciplines', () => {
  assert.strictEqual(spelsoortVanDiscipline('9-Ball'), '9');
  assert.strictEqual(spelsoortVanDiscipline('10-Ball'), '10');
  assert.strictEqual(spelsoortVanDiscipline('8-Ball'), '8');
  assert.strictEqual(spelsoortVanDiscipline('One Pocket'), '1');
  assert.strictEqual(spelsoortVanDiscipline('Multiball'), null);
  assert.strictEqual(spelsoortVanDiscipline(''), null);
});

test('spelsoortVanDiscipline: 8&10-combi uit de naam wint', () => {
  assert.strictEqual(spelsoortVanDiscipline('10-Ball', 'Mokum 8 & 10ball Ranking (10ball) #19'), '8-10');
  assert.strictEqual(spelsoortVanDiscipline('10-Ball', 'Mokum 8/10 ball #3'), '8-10');
  assert.strictEqual(spelsoortVanDiscipline('9-Ball', 'MEGA Ranking i.s.m. Buffalo #22'), '9');
});

test('sponsorVanNaam: herkent bekende sponsor (Buffalo)', () => {
  assert.strictEqual(sponsorVanNaam('MEGA Ranking i.s.m. Buffalo #22 ½ (Dubbele punten)'), 'buffalo.png');
  assert.strictEqual(sponsorVanNaam('Iets met BUFFALO erin'), 'buffalo.png');
  assert.strictEqual(sponsorVanNaam('Fluke ranking 9ball #23'), null);
  assert.strictEqual(sponsorVanNaam(''), null);
});

test('schoneTitel: strip alleen de herkende sponsor (+ evt. i.s.m.)', () => {
  assert.strictEqual(schoneTitel('MEGA Ranking i.s.m. Buffalo #22 ½ (Dubbele punten)'), 'MEGA Ranking #22 ½ (Dubbele punten)');
  assert.strictEqual(schoneTitel('Ranking i.s.m. Buffalo'), 'Ranking');
  // Echte titelwoorden na de sponsor blijven staan (geen over-strip):
  assert.strictEqual(schoneTitel('ISM Buffalo Toernooi #5'), 'Toernooi #5');
});

test('schoneTitel: laat een naam zonder i.s.m. ongemoeid', () => {
  assert.strictEqual(schoneTitel('Fluke ranking 9ball Seizoen 3 #23'), 'Fluke ranking 9ball Seizoen 3 #23');
});

test('templateVoorToernooi: kiest de juiste template per (Cuescore-)naam', () => {
  assert.strictEqual(templateVoorToernooi('MEGA Ranking i.s.m. Buffalo #22'), 'mega-ranking-buffalo');
  assert.strictEqual(templateVoorToernooi('MEGA Summer Ranking #7'), 'mega-summer-ranking');
  assert.strictEqual(templateVoorToernooi('Mokum 8 & 10ball Ranking (10ball) #19'), '8-10-ball-ranking');
  assert.strictEqual(templateVoorToernooi('Mokum 8/10 ball #3'), '8-10-ball-ranking');
  assert.strictEqual(templateVoorToernooi('14.1 Summer League #4'), '14-1-summer-league');
  assert.strictEqual(templateVoorToernooi('Fluke ranking 9ball #23'), 'fluke-ranking');
  assert.strictEqual(templateVoorToernooi('Speedy Multiball Sunday'), 'speedy-multi-ball');
  assert.strictEqual(templateVoorToernooi('Handicap Madness #2'), 'handicap-madness');
  assert.strictEqual(templateVoorToernooi('Blind Double Members'), 'blind-double');
  assert.strictEqual(templateVoorToernooi('Best of One — alles of niets'), 'best-of-one');
  assert.strictEqual(templateVoorToernooi('Go Customs Amsterdam Open 2026'), 'go-customs-amsterdam-open');
});

test('templateVoorToernooi: onbekend toernooi → null (canvas-fallback)', () => {
  assert.strictEqual(templateVoorToernooi('Willekeurig Open Toernooi #1'), null);
  assert.strictEqual(templateVoorToernooi(''), null);
});

test('datumThumb: korte hoofdletter-datum voor de datumpil', () => {
  // 22 juli 2026 is een woensdag (Europe/Amsterdam).
  assert.strictEqual(datumThumb('2026-07-22T19:30:00+02:00'), 'WO 22 JULI');
  assert.strictEqual(datumThumb('geen datum'), '');
});
