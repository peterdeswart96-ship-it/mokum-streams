const test = require('node:test');
const assert = require('node:assert');
const { spelsoortVanDiscipline, sponsorVanNaam, schoneTitel } = require('../src/video/detectie');

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
