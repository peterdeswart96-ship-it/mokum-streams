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

test('duiding: een echte fout wint van elke andere regel', () => {
  // Deze regel begint met [Tag=...] en zou anders nergens op matchen.
  const d = duidRegel('[WAARSCHUWING] [streams/start] tafel 1: opruimen van de stream key mislukt');
  assert.strictEqual(d.soort, 'fout');
});

// Opstartruis van Azure stond eerst als rood PROBLEEM in de mail (gemeld 05-08). De server
// slaapt als er niets te doen is; start hij weer op, dan vraagt Azure "ben je er al?"
// terwijl Node nog laadt. Op 04-08 stond dit om 23:53 in de logs en om 23:55 stopte
// checkStops de tafel gewoon — er is niets door geraakt.
test('#91: opstartruis is geen probleem', () => {
  const d = duidRegel("[Tag=''] Process reporting unhealthy: Unhealthy. errorCode NoScriptHost");
  assert.strictEqual(d.soort, 'neutraal');
  assert.match(d.titel, /opnieuw opgestart/);

  const a = analyseer([{ tijd: T(21, 53), bericht: "[Tag=''] Process reporting unhealthy: NoScriptHost" }]);
  assert.strictEqual(a.cijfers.problemen, 0);
  assert.ok(!a.bevindingen.some((b) => /waarschuwing/i.test(b.kop)), JSON.stringify(a.bevindingen));
});

// `[createBroadcasts] tafel-herresolutie` schrijft de timer elke vijf minuten zolang een
// toernooi loopt. Die stond op 05-08 negen keer als "Uitzending automatisch gestart" in de
// mail, terwijl er twee uitzendingen waren.
test('#91: alleen de échte startregel telt als automatische start', () => {
  const a = analyseer([
    { tijd: T(17, 20), bericht: '[createBroadcasts] tafel-herresolutie toernooi 75880936: [1,3] → [1,3]' },
    { tijd: T(17, 20), bericht: '[OK] Broadcast + startcommando\'s: tafel 1 — "Tafel 1 Fluke" (Tnb1nUZBFSc)' },
    { tijd: T(17, 20), bericht: '[OK] Broadcast + startcommando\'s: tafel 3 — "Tafel 3 Fluke" (-WbrJ0B5Heg)' },
    { tijd: T(17, 25), bericht: '[createBroadcasts] tafel-herresolutie toernooi 75880936: [1,3] → [1,3]' },
    { tijd: T(17, 30), bericht: '[createBroadcasts] tafel-herresolutie toernooi 75880936: [1,3] → [1,3]' },
  ]);
  assert.strictEqual(a.cijfers.automatischGestart, 2);
  // Twee verschillende tafels blijven apart staan — het tafelnummer zit in de titel.
  assert.deepStrictEqual(a.gebeurtenissen.map((g) => g.titel), [
    'Tafel 1: automatisch gestart volgens de planning',
    'Tafel 3: automatisch gestart volgens de planning',
  ]);
  assert.ok(!a.gebeurtenissen.some((g) => /herresolutie/.test(g.bericht)), 'herresolutie hoort niet in het rapport');
});

// Het rapport gooide weg wélke tafel stopte en waarom; er stond alleen "het systeem zag dat
// er niets meer te tonen was". Juist die reden maakt het interessant (gemeld 05-08).
test('#91: een automatische stop vertelt welke tafel en waarom', () => {
  const d = duidRegel('[checkStops] tafel 3: stoppen — finale bezig op tafel 1; deze tafel heeft geen wedstrijd meer (#72)');
  assert.strictEqual(d.titel, 'Tafel 3: automatisch gestopt');
  assert.match(d.uitleg, /finale was bezig op tafel 1/);

  const podium = duidRegel('[checkStops] tafel 1: stoppen — toernooi klaar, podium-grace van 180s verstreken');
  assert.strictEqual(podium.titel, 'Tafel 1: automatisch gestopt');
  assert.match(podium.uitleg, /medaillescherm/);
});

test('#91: een afgeronde video noemt de tafel en het aantal hoofdstukken', () => {
  const d = duidRegel('[finalizeVideos] tafel 16 gefinaliseerd (v6RSnIDhLrw) — 2 hoofdstukken');
  assert.strictEqual(d.titel, 'Tafel 16: video afgerond');
  assert.match(d.uitleg, /2 hoofdstukken/);
});

test('#91: herhaalde regels worden samengevouwen in plaats van herhaald', () => {
  const a = analyseer(Array.from({ length: 9 }, (_, i) => ({
    tijd: T(17, 20 + i * 5),
    bericht: '[OK] Broadcast + startcommando\'s: tafel 1 — "x" (abc)',
  })));
  assert.strictEqual(a.gebeurtenissen.length, 1);
  assert.strictEqual(a.gebeurtenissen[0].aantal, 9);
  assert.ok(a.gebeurtenissen[0].laatsteTijd);
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

// ── Herinnering: staat er vanavond iets klaar dat niet is ingepland? (#92) ───
//
// Voorbeeld uit de praktijk: op 03-08 stond "Mokum MEGA Summer Ranking #27" op
// planned:false. Deze controle had die ochtend al gewaarschuwd.

const { tekort, onderwerp: herinneringOnderwerp, tekst: herinneringTekst } = require('../src/rapport/herinnering');

const NU = new Date('2026-08-03T10:00:00Z'); // 12:00 Amsterdam
const record = (extra) => ({
  tournamentId: 1, name: 'Toernooi', type: 'tournament', date: '2026-08-03',
  plannedStart: '2026-08-03T17:15:00Z', tafels: [1, 3], enabled: true, planned: false,
  status: 'concept', ...extra,
});

test('#92: een niet-ingepland toernooi van vandaag wordt gemeld', () => {
  const l = tekort([record({ name: 'Mokum MEGA Summer Ranking #27' })], NU);
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].naam, 'Mokum MEGA Summer Ranking #27');
  assert.strictEqual(l[0].start, '19:15');
  assert.deepStrictEqual(l[0].tafels, [1, 3]);
});

test('#92: een ingepland toernooi levert geen herinnering op', () => {
  assert.deepStrictEqual(tekort([record({ planned: true })], NU), []);
});

test('#92: toernooien van een andere dag tellen niet mee', () => {
  assert.deepStrictEqual(tekort([record({ date: '2026-08-04' })], NU), []);
  assert.deepStrictEqual(tekort([record({ date: '2026-08-02' })], NU), []);
});

test('#92: draait het al, of is het al klaar, dan geen herinnering meer', () => {
  // Iemand heeft het met de hand gestart — daar hoeft geen mail meer overheen.
  assert.deepStrictEqual(tekort([record({ status: 'live' })], NU), []);
  assert.deepStrictEqual(tekort([record({ status: 'klaar' })], NU), []);
});

test('#92: bewust uitgezet of geannuleerd → met rust laten', () => {
  assert.deepStrictEqual(tekort([record({ enabled: false })], NU), []);
  assert.deepStrictEqual(tekort([record({ geannuleerd: true })], NU), []);
});

test('#92: doorlopende competities blijven buiten beschouwing', () => {
  // Een league loopt maanden; "vandaag" zegt daar niets over. Zou anders elke dag een mail
  // opleveren, en dan leest niemand 'm meer.
  assert.deepStrictEqual(tekort([record({ type: 'competition' })], NU), []);
});

test('#92: meerdere toernooien komen op tijd gesorteerd', () => {
  const l = tekort([
    record({ tournamentId: 2, name: 'Laat', plannedStart: '2026-08-03T19:00:00Z' }),
    record({ tournamentId: 3, name: 'Vroeg', plannedStart: '2026-08-03T15:30:00Z' }),
  ], NU);
  assert.deepStrictEqual(l.map((x) => x.naam), ['Vroeg', 'Laat']);
  assert.match(herinneringOnderwerp(l), /2 toernooien/);
});

test('#92: bij één toernooi staat de naam in het onderwerp', () => {
  const l = tekort([record({ name: 'Fluke ranking' })], NU);
  assert.match(herinneringOnderwerp(l), /Fluke ranking/);
  assert.match(herinneringOnderwerp(l), /19:15/);
});

test('#92: niets te melden → geen onderwerp, dus geen mail', () => {
  assert.strictEqual(herinneringOnderwerp([]), null);
});

test('#92: de tekst legt uit waarom het uitmaakt', () => {
  const t = herinneringTekst(tekort([record()], NU));
  assert.match(t, /start het systeem niets uit zichzelf/);
  assert.match(t, /Toernooi planner/);
});

test('#92: rommel in de planning laat de controle niet omvallen', () => {
  assert.deepStrictEqual(tekort(null, NU), []);
  assert.deepStrictEqual(tekort([null, {}, { name: 'x' }], NU), []);
});
