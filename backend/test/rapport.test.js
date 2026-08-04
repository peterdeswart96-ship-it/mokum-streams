const test = require('node:test');
const assert = require('node:assert');
const { duidRegel, analyseer, uurNotatie } = require('../src/rapport/duiding');
const { onderwerp, tekst, html } = require('../src/rapport/mail');

// Tests voor het ochtendrapport (#91). De voorbeelden hieronder zijn ECHTE logregels van
// de avond van 3 augustus 2026 — de avond waarop het toernooi niet was ingepland en een
// challenge-uitzending acht uur bleef openstaan.

const T = (u, m) => new Date(`2026-08-03T${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

test('duiding: een losse uitzending wordt herkend als aandachtspunt', () => {
  const d = duidRegel('[streams/start] tafel 1 HANDMATIG gestart via het dashboard — ad-hoc (geen toernooi), public, video I9a3epTPE5I');
  assert.strictEqual(d.soort, 'let-op');
  assert.match(d.uitleg, /stopt nooit vanzelf/);
});

test('duiding: een automatische stop is goed nieuws', () => {
  const d = duidRegel('[checkStops] tafel 1: stoppen — toernooi klaar, podium-grace van 180s verstreken');
  assert.strictEqual(d.soort, 'goed');
});

test('duiding: een waarschuwing wint van elke andere regel', () => {
  // Deze regel begint met [Tag=...] en zou anders nergens op matchen.
  const d = duidRegel("[Tag=''] Process reporting unhealthy: Unhealthy. errorCode NoScriptHost");
  assert.strictEqual(d.soort, 'fout');
});

test('duiding: routinewerk hoort niet in het rapport', () => {
  assert.strictEqual(duidRegel('[OK] Planning bijgewerkt: 10 geïmporteerd, 23 records totaal.'), null);
  assert.strictEqual(duidRegel('[sheets] herbouwd: 5 winnaars, 5 komend'), null);
  assert.strictEqual(duidRegel('[liveMatches] bijgewerkt — 2/4 tafels live · 8 in de zaal'), null);
  assert.strictEqual(duidRegel(''), null);
  assert.strictEqual(duidRegel(null), null);
});

// ── De avond van 3 augustus, verkort ─────────────────────────────────────────
const AVOND = [
  { tijd: T(14, 40), bericht: '[streams/start] tafel 1 HANDMATIG gestart via het dashboard — ad-hoc (geen toernooi), public, video I9a3epTPE5I' },
  { tijd: T(15, 58), bericht: "[Tag=''] Process reporting unhealthy: Unhealthy. errorCode NoScriptHost" },
  { tijd: T(17, 23), bericht: '[checkStops] tafel 1: ad-hoc stream gekoppeld aan "Mokum MEGA Summer Ranking #27" (84675253) → automatisering actief.' },
  { tijd: T(17, 39), bericht: '[streams/start] tafel 3 HANDMATIG gestart via het dashboard — gekoppeld aan toernooi 84675253, public, video cE-A_9imUPk' },
  { tijd: T(17, 41), bericht: '[pauzeScherm] tafel 3 → spelen (pauzescherm uit)' },
  { tijd: T(17, 43), bericht: '[pauzeScherm] tafel 16 → spelen (pauzescherm uit)' },
  { tijd: T(23, 6), bericht: '[checkStops] tafel 3: stoppen — finale bezig op tafel 1; deze tafel heeft geen wedstrijd meer (#72)' },
  { tijd: T(23, 7), bericht: '[finalizeVideos] tafel 3 gefinaliseerd (cE-A_9imUPk) — 6 hoofdstukken' },
  { tijd: T(23, 11), bericht: '[streams/stop] tafel 1 HANDMATIG gestopt via het dashboard — video I9a3epTPE5I' },
  { tijd: T(23, 12), bericht: '[finalizeVideos] tafel 1 gefinaliseerd (I9a3epTPE5I) — 11 hoofdstukken' },
];

test('analyse: telt wat er gebeurd is', () => {
  const a = analyseer(AVOND);
  assert.strictEqual(a.cijfers.afgerondeVideos, 2);
  assert.strictEqual(a.cijfers.hoofdstukken, 17);
  assert.strictEqual(a.cijfers.pauzeschakelingen, 2);
  assert.strictEqual(a.cijfers.automatischGestopt, 1);
  assert.strictEqual(a.cijfers.handmatigGestart, 2);
  assert.strictEqual(a.cijfers.automatischGestart, 0);
});

test('analyse: pauzescherm-regels worden geteld maar niet los getoond', () => {
  const a = analyseer(AVOND);
  assert.ok(!a.gebeurtenissen.some((g) => /pauzeScherm/.test(g.bericht)), 'pauzescherm hoort niet in de lijst');
});

test('analyse: merkt op dat er niets automatisch is gestart', () => {
  const a = analyseer(AVOND);
  const b = a.bevindingen.find((x) => /met de hand gestart/i.test(x.kop));
  assert.ok(b, 'verwacht een bevinding over handmatig starten');
  assert.strictEqual(b.soort, 'fout');
  assert.match(b.tekst, /niet is ingepland/);
});

test('analyse: merkt de losse uitzending op die acht uur openstond', () => {
  const a = analyseer(AVOND);
  const b = a.bevindingen.find((x) => /Losse uitzending op tafel 1/.test(x.kop));
  assert.ok(b, 'verwacht een bevinding over de lange losse uitzending');
  assert.match(b.kop, /8 uur en 31 minuten/);
  assert.match(b.tekst, /stopt nooit vanzelf/);
});

test('analyse: een uitzending die nooit gestopt is telt ook mee', () => {
  // Zelfde avond, maar zonder de stop-regel: dan loopt hij door tot het eind van het venster.
  const a = analyseer(AVOND.filter((r) => !/streams\/stop/.test(r.bericht)));
  assert.ok(a.bevindingen.some((x) => /tafel 1 is nooit gestopt/.test(x.kop)));
});

// Een toernooi-uitzending van zes uur is doodnormaal. Zou die als fout in de mail komen,
// dan staat er élke avond een probleem in en leest niemand 'm nog.
test('analyse: een lange TOERNOOI-uitzending is geen probleem', () => {
  const a = analyseer([
    { tijd: T(17, 0), bericht: '[createBroadcasts] tafel 1 gestart volgens planning' },
    { tijd: T(23, 11), bericht: '[checkStops] tafel 1: stoppen — toernooi klaar, podium-grace van 180s verstreken' },
    { tijd: T(23, 11), bericht: '[OK] 1 stopStream-commando(s): tafels 1' },
  ]);
  assert.ok(!a.bevindingen.some((b) => b.soort === 'fout'), JSON.stringify(a.bevindingen));
});

test('analyse: "tafels 1, 3" sluit beide tafels af, ondanks het meervoud', () => {
  const a = analyseer([
    { tijd: T(17, 0), bericht: '[createBroadcasts] tafel 1 gestart' },
    { tijd: T(17, 0), bericht: '[createBroadcasts] tafel 3 gestart' },
    { tijd: T(20, 0), bericht: '[OK] 2 stopStream-commando(s): tafels 1, 3' },
  ]);
  assert.ok(!a.bevindingen.some((b) => /nooit gestopt/.test(b.kop)), JSON.stringify(a.bevindingen));
});

test('analyse: een rustige avond levert "niets bijzonders" op', () => {
  const rustig = [
    { tijd: T(17, 0), bericht: '[createBroadcasts] tafel 1 gestart volgens planning' },
    { tijd: T(23, 0), bericht: '[checkStops] tafel 1: stoppen — toernooi klaar' },
    { tijd: T(23, 1), bericht: '[finalizeVideos] tafel 1 gefinaliseerd (abc) — 9 hoofdstukken' },
  ];
  const a = analyseer(rustig);
  assert.strictEqual(a.bevindingen.length, 1);
  assert.strictEqual(a.bevindingen[0].soort, 'goed');
  assert.match(a.bevindingen[0].kop, /Niets bijzonders/);
});

test('analyse: een herhaalde fout telt als één probleem, maar valt niet weg', () => {
  const spam = Array.from({ length: 50 }, (_, i) => ({ tijd: T(20, i % 60), bericht: '[WAARSCHUWING] iets ging mis' }));
  const a = analyseer(spam);
  assert.strictEqual(a.cijfers.problemen, 1);
  assert.ok(a.bevindingen.some((b) => /waarschuwing/i.test(b.kop)));
});

test('analyse: lege invoer valt niet om', () => {
  for (const w of [null, undefined, []]) {
    const a = analyseer(w);
    assert.strictEqual(a.gebeurtenissen.length, 0);
    assert.strictEqual(a.bevindingen[0].soort, 'goed');
  }
});

// ── De mail zelf ─────────────────────────────────────────────────────────────

test('mail: het onderwerp zegt meteen of je moet kijken', () => {
  const druk = onderwerp('2026-08-03', analyseer(AVOND));
  assert.match(druk, /aandachtspunten/);
  assert.match(druk, /maandag 3 augustus 2026/);

  const rustig = onderwerp('2026-08-03', analyseer([
    { tijd: T(23, 0), bericht: '[finalizeVideos] tafel 1 gefinaliseerd (abc) — 9 hoofdstukken' },
  ]));
  assert.match(rustig, /alles ging vanzelf/);
  assert.match(rustig, /1 video afgerond/);
});

test('mail: de HTML bevat geen losse stijlblokken en ontsnapt aan tekens', () => {
  const a = analyseer([{ tijd: T(20, 0), bericht: '[streams/start] tafel 1 HANDMATIG gestart <script>alert(1)</script>' }]);
  const h = html('2026-08-03', a);
  assert.ok(!/<style/i.test(h), 'e-mailprogramma\'s gooien <style> weg — alles moet inline');
  assert.ok(!/<script/i.test(h), 'geen ongefilterde invoer in de mail');
});

test('mail: de tekstversie is leesbaar zonder opmaak', () => {
  const t = tekst('2026-08-03', analyseer(AVOND));
  assert.match(t, /STREAMAVOND MAANDAG 3 AUGUSTUS 2026/);
  assert.match(t, /IN HET KORT/);
  assert.match(t, /WAT ER GEBEURDE/);
});

test('uurNotatie: leest als een mens', () => {
  assert.strictEqual(uurNotatie(45), '45 minuten');
  assert.strictEqual(uurNotatie(511), '8 uur en 31 minuten');
  assert.strictEqual(uurNotatie(120), '2 uur en 0 minuten');
});
