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
  assert.strictEqual(templateVoorToernooi('Mokum 14.1 Summer league - Bob/Etienne'), '14-1-summer-league');
  // NK-kwalificatie met 14.1 als discipline is GEEN Mokum-serie → geen template:
  assert.strictEqual(templateVoorToernooi('NK Pool 2026 14.1 Kwalificatieronde - Mokum'), null);
  assert.strictEqual(templateVoorToernooi('Fluke ranking 9ball #23'), 'fluke-ranking');
  assert.strictEqual(templateVoorToernooi('Speedy Multiball Sunday'), 'speedy-multi-ball');
  assert.strictEqual(templateVoorToernooi('Handicap Madness #2'), 'handicap-madness');
  assert.strictEqual(templateVoorToernooi('Blind Double Members'), 'blind-double');
  assert.strictEqual(templateVoorToernooi('Best of One — alles of niets'), 'best-of-one');
  assert.strictEqual(templateVoorToernooi('Go Customs Amsterdam Open 2026'), 'go-customs-amsterdam-open');
  // Amsterdam Open ook zonder "Go Customs" in de naam (#73):
  assert.strictEqual(templateVoorToernooi('Amsterdam Open 2026'), 'go-customs-amsterdam-open');
  // NK 10-ball kwalificatie (#73) → eigen template; een NK met 14.1 blijft null (zie hierboven).
  assert.strictEqual(templateVoorToernooi('NK 10-ball kwalificatie #1'), 'nk-10ball');
  assert.strictEqual(templateVoorToernooi('NK 10 ball Kwalificatieronde - Mokum'), 'nk-10ball');
  // "Summer Ranking" zonder "MEGA" in de naam (typefout) → toch de MEGA Summer-template:
  assert.strictEqual(templateVoorToernooi('Mokum Summer Ranking 22'), 'mega-summer-ranking');
  assert.strictEqual(templateVoorToernooi('Mokum Summer ranking #22'), 'mega-summer-ranking');
  // Koppeltoernooi (#96-vervolg) — "koppel" is hoe dit type in Cuescore in de praktijk heet
  // (echt voorbeeld: "Paas koppel toernooi @Mokum"); "doubles" voor een Engelse variant.
  assert.strictEqual(templateVoorToernooi('Paas koppel toernooi @Mokum'), 'doubles-tournament');
  assert.strictEqual(templateVoorToernooi('Mokum Doubles Tournament #3'), 'doubles-tournament');
  // "Blind Double" blijft bij zijn eigen template — "double" alleen (geen "doubles"/"koppel")
  // mag dit niet overrulen.
  assert.strictEqual(templateVoorToernooi('Blind Double Members'), 'blind-double');
  // King of the table — echt voorbeeld: "Tafel 16 King of the table" (14-08, geen toernooi
  // gekoppeld, wachtte op dit ontwerp).
  assert.strictEqual(templateVoorToernooi('Tafel 16 King of the table'), 'king-of-the-table');
  assert.strictEqual(templateVoorToernooi('KING OF THE TABLE #4'), 'king-of-the-table');
});

test('templateVoorToernooi: 9-ball Sunday in al zijn schrijfwijzen (#95)', () => {
  // Negen echte titels uit het archief — allerlei volgorde, hoofdletters, prefix/suffix.
  const titels = [
    '9 BALL SUNDAY 19:30 €5 ENTRY',
    '9 ball sunday 19:00 €10 entry',
    '9 ball sunday 19:30 €5 entry',
    '9 ball sunday',
    'High stakes 9 ball sunday 19:30 €20 entry (16 players max)',
    'MOKUM 9 BALL SUNDAY 19:00',
    'MOKUM 9 BALL SUNDAY 19:30',
    'Mokum 9-ball sunday',
    'Mokum Sunday 9-ball', // omgekeerde volgorde
  ];
  for (const t of titels) assert.strictEqual(templateVoorToernooi(t), '9-ball-sunday', t);
  // "Very last minute 9 ball" heeft geen "sunday" → blijft bij zijn eigen template.
  assert.strictEqual(templateVoorToernooi('Tafel 1 Very last minute 9 ball'), 'last-minute-9ball');
});

test('templateVoorToernooi: Mokum 8-ball Ranking (#95), niet te verwarren met 8&10-ball', () => {
  const titels = [
    'MOKUM 8BALL RANKING #10',
    'MOKUM 8BALL RANKING SEIZOEN 2 #1',
    'Mokum 8ball Ranking Seizoen 2 #16',
    'Mokum 8 ball Ranking',
    'EIND TOERNOOI TOP 16 MOKUM 8BALL RANKING',
    'Eind toernooi top 24 Mokum 8ball ranking 2de seizoen',
  ];
  for (const t of titels) assert.strictEqual(templateVoorToernooi(t), '8-ball-ranking', t);
  // Een editienummer als #10 mag de 8&10-ball-combinatie niet per ongeluk triggeren —
  // die vereist 8 en 10 vlak náást elkaar, niet los verspreid in de titel.
  assert.strictEqual(templateVoorToernooi('Mokum 8 & 10ball Ranking (10ball) #19'), '8-10-ball-ranking');
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
