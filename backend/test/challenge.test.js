const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// Tests voor het aanmaken van challenges door leden (#90). Alleen de pure onderdelen:
// versleuteling, tokens en sjabloonvalidatie. De Cuescore-client zelf is netwerkcode en
// is live geverifieerd (zie docs/cuescore-challenge.md).

// Een vaste testsleutel; de echte staat in Key Vault.
process.env.CHALLENGE_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

const { versleutel, ontsleutel, nieuweHoofdsleutel } = require('../src/challenge/kluis');
const { maakToken, leesToken, ledId } = require('../src/challenge/token');
const { normaliseerSjabloon, normaliseerSjablonen, MAX_SJABLONEN, MAX_NAAM } = require('../src/challenge/sjablonen');

// ── Kluis ────────────────────────────────────────────────────────────────────

test('kluis: wat erin gaat komt er weer uit', () => {
  const geheim = versleutel('mijn-wachtwoord-123');
  assert.strictEqual(ontsleutel(geheim), 'mijn-wachtwoord-123');
});

test('kluis: het wachtwoord staat niet leesbaar in de opslag', () => {
  const geheim = versleutel('Hunter2!');
  const opgeslagen = JSON.stringify(geheim);
  assert.ok(!opgeslagen.includes('Hunter2'), 'wachtwoord mag nergens in de opgeslagen vorm zitten');
  assert.deepStrictEqual(Object.keys(geheim).sort(), ['data', 'iv', 'tag']);
});

test('kluis: twee keer hetzelfde wachtwoord geeft verschillende cijfertekst', () => {
  // Anders kun je aan de opslag zien welke leden hetzelfde wachtwoord hebben.
  const a = versleutel('zelfde');
  const b = versleutel('zelfde');
  assert.notStrictEqual(a.iv, b.iv);
  assert.notStrictEqual(a.data, b.data);
});

test('kluis: geknoei met de data wordt geweigerd, niet stilzwijgend geslikt', () => {
  const geheim = versleutel('geheim');
  const rommel = Buffer.from(geheim.data, 'base64');
  rommel[0] ^= 0xff;
  assert.throws(() => ontsleutel({ ...geheim, data: rommel.toString('base64') }));
});

test('kluis: met een andere sleutel lukt ontsleutelen niet', () => {
  const geheim = versleutel('geheim');
  const andere = Buffer.from(nieuweHoofdsleutel(), 'base64');
  assert.throws(() => ontsleutel(geheim, andere));
});

test('kluis: een sleutel van de verkeerde lengte wordt geweigerd', () => {
  const oud = process.env.CHALLENGE_MASTER_KEY;
  process.env.CHALLENGE_MASTER_KEY = Buffer.alloc(16, 1).toString('base64'); // 128 bits
  assert.throws(() => versleutel('x'), /32 bytes/);
  process.env.CHALLENGE_MASTER_KEY = oud;
});

test('kluis: onvolledig geheim geeft een fout', () => {
  assert.throws(() => ontsleutel({ iv: 'x', data: 'y' }), /onvolledig/);
  assert.throws(() => ontsleutel(null), /onvolledig/);
});

// ── Token ────────────────────────────────────────────────────────────────────

test('token: een vers token leest terug naar hetzelfde lid', () => {
  const id = ledId('Peter@Voorbeeld.nl');
  assert.deepStrictEqual(leesToken(maakToken(id)), { ledId: id });
});

test('token: hoofdletters en spaties in het e-mailadres geven hetzelfde lid', () => {
  assert.strictEqual(ledId('  Peter@Voorbeeld.NL '), ledId('peter@voorbeeld.nl'));
});

test('token: het e-mailadres is niet uit het lid-id af te leiden', () => {
  const id = ledId('peter@voorbeeld.nl');
  assert.ok(!id.includes('peter'));
  assert.strictEqual(id.length, 32);
});

test('token: een verlopen token wordt geweigerd', () => {
  const t = maakToken(ledId('a@b.nl'), { nu: new Date('2026-01-01T00:00:00Z'), dagen: 1 });
  assert.strictEqual(leesToken(t, { nu: new Date('2026-01-03T00:00:00Z') }), null);
  assert.notStrictEqual(leesToken(t, { nu: new Date('2026-01-01T12:00:00Z') }), null);
});

test('token: geknoei met de inhoud maakt het token ongeldig', () => {
  const t = maakToken(ledId('a@b.nl'));
  const [payload, hand] = t.split('.');
  // Iemand probeert zich voor een ander lid uit te geven door de payload te vervangen.
  const vals = Buffer.from(JSON.stringify({
    ledId: ledId('slachtoffer@b.nl'),
    verlooptOp: new Date(Date.now() + 86400000).toISOString(),
  })).toString('base64url');
  assert.strictEqual(leesToken(`${vals}.${hand}`), null);
  assert.strictEqual(leesToken(`${payload}.${hand}x`), null);
});

test('token: met een ander geheim ondertekend telt niet', () => {
  const t = maakToken(ledId('a@b.nl'), { s: 'geheim-A' });
  assert.strictEqual(leesToken(t, { s: 'geheim-B' }), null);
  assert.notStrictEqual(leesToken(t, { s: 'geheim-A' }), null);
});

test('token: rommel geeft null en geen uitzondering', () => {
  for (const w of [null, undefined, '', 'geen.token', 'a.b.c', 42, {}]) {
    assert.strictEqual(leesToken(w), null, JSON.stringify(w));
  }
});

// ── Sjablonen ────────────────────────────────────────────────────────────────

test('sjabloon: een normaal sjabloon blijft heel', () => {
  const s = normaliseerSjabloon({ naam: 'Lennert', discipline: 3, raceTo: 5, breakrule: 'winner', tegenstanderId: 3404805, tegenstanderNaam: 'Lennert Duyn' });
  assert.deepStrictEqual(s, {
    naam: 'Lennert', discipline: 3, raceTo: 5, breakrule: 'winner',
    tegenstanderId: 3404805, tegenstanderNaam: 'Lennert Duyn',
  });
});

test('sjabloon: zonder naam wordt er een leesbare naam bedacht', () => {
  assert.strictEqual(normaliseerSjabloon({ discipline: 3, raceTo: 5 }).naam, '9-Ball race 5');
  assert.strictEqual(normaliseerSjabloon({ discipline: 99, raceTo: 7 }).naam, 'challenge race 7');
});

test('sjabloon: een onzinnige race wordt geweigerd', () => {
  for (const r of [0, -1, 'veel', null, 999]) {
    assert.strictEqual(normaliseerSjabloon({ discipline: 3, raceTo: r }), null, String(r));
  }
});

test('sjabloon: een onbekende breakrule valt terug op winner', () => {
  assert.strictEqual(normaliseerSjabloon({ discipline: 3, raceTo: 5, breakrule: 'iets' }).breakrule, 'winner');
  assert.strictEqual(normaliseerSjabloon({ discipline: 3, raceTo: 5, breakrule: 'alternate' }).breakrule, 'alternate');
});

test('sjabloon: een sjabloon zonder tegenstander mag — die kies je dan bij het aanmaken', () => {
  const s = normaliseerSjabloon({ naam: 'Snel potje', discipline: 3, raceTo: 5 });
  assert.ok(!('tegenstanderId' in s));
});

test('sjabloon: een te lange naam wordt afgekapt en witruimte opgeruimd', () => {
  const s = normaliseerSjabloon({ naam: '  veel    spaties ' + 'x'.repeat(80), discipline: 3, raceTo: 5 });
  assert.ok(s.naam.length <= MAX_NAAM);
  assert.ok(!s.naam.includes('    '));
});

test('sjabloon: de automatisch gevormde naam past binnen de limiet', () => {
  // "Lennert Duyn, race to 5, 9-Ball, tafel 1" — de vorm die de pagina voorstelt.
  const naam = 'Michelle Konynenberg-Harrison, race to 100, 14.1 (straight pool), tafel 16';
  const s = normaliseerSjabloon({ naam, discipline: 5, raceTo: 100, tafel: 16 });
  assert.strictEqual(s.naam.length, MAX_NAAM); // afgekapt, maar niet geweigerd
  assert.strictEqual(s.tafel, 16);
});

test('sjabloon: een tafel wordt bewaard, een onbekende tafel niet', () => {
  assert.strictEqual(normaliseerSjabloon({ discipline: 3, raceTo: 5, tafel: 1 }).tafel, 1);
  assert.strictEqual(normaliseerSjabloon({ discipline: 3, raceTo: 5, tafel: 15 }).tafel, 15);
  for (const t of [0, 99, -1, 'tafel 1', null, undefined]) {
    assert.ok(!('tafel' in normaliseerSjabloon({ discipline: 3, raceTo: 5, tafel: t })), String(t));
  }
});

test('sjablonen: rommel eruit, dubbele weg, begrensd op het maximum', () => {
  const lijst = normaliseerSjablonen([
    { naam: 'A', discipline: 3, raceTo: 5 },
    { naam: 'a', discipline: 3, raceTo: 9 },   // zelfde naam (hoofdletterongevoelig) → weg
    null, 'onzin', { naam: 'B', raceTo: 0 },   // allemaal ongeldig
    ...Array.from({ length: 20 }, (_, i) => ({ naam: `T${i}`, discipline: 3, raceTo: 5 })),
  ]);
  assert.strictEqual(lijst.length, MAX_SJABLONEN);
  assert.strictEqual(lijst[0].naam, 'A');
  assert.strictEqual(lijst.filter((s) => s.naam.toLowerCase() === 'a').length, 1);
});

test('sjablonen: dezelfde naam met een andere tegenstander mag wél naast elkaar', () => {
  const lijst = normaliseerSjablonen([
    { naam: 'Race 5', discipline: 3, raceTo: 5, tegenstanderId: 1 },
    { naam: 'Race 5', discipline: 3, raceTo: 5, tegenstanderId: 2 },
  ]);
  assert.strictEqual(lijst.length, 2);
});

test('sjablonen: geen lijst → lege lijst, geen fout', () => {
  for (const w of [null, undefined, 'x', 42, {}]) assert.deepStrictEqual(normaliseerSjablonen(w), []);
});
