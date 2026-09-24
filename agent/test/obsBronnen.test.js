const test = require('node:test');
const assert = require('node:assert');
const { maskeerUrl, normaliseerUrl, normaliseerNaam, veiligeInstellingen, vergelijkTafels, maakMarkdown } = require('../src/obsBronnen');

// Tests voor het uitleesscript van de OBS-bronnen (#98). Het belangrijkste is dat er nooit
// inloggegevens uitkomen: camerabronnen (RTSP/UniFi Protect) kunnen die in hun URL hebben.

test('maskeerUrl: gebruikersnaam en wachtwoord in de URL verdwijnen', () => {
  const m = maskeerUrl('rtsps://beheer:geheim123@192.168.1.10:7441/abc?enableSrtp');
  assert.ok(!m.includes('geheim123'), m);
  assert.ok(!m.includes('beheer'), m);
});

test('maskeerUrl: gevoelige queryparameters worden gemaskeerd, gewone blijven', () => {
  const m = maskeerUrl('https://x.nl/pauze/slides/02-jumbotron.html?tafel=1&token=abc123&scoresSec=20');
  assert.ok(!m.includes('abc123'), m);
  assert.match(m, /tafel=1/);
  assert.match(m, /scoresSec=20/);
});

test('maskeerUrl: een gewone pauze-URL blijft leesbaar', () => {
  assert.strictEqual(
    maskeerUrl('https://mokum-streams.pdscloud.nl/pauze/intro.html?table=3'),
    'https://mokum-streams.pdscloud.nl/pauze/intro.html?table=3',
  );
});

test('maskeerUrl: rommel of leeg laat niets omvallen en lekt geen user:pass', () => {
  assert.strictEqual(maskeerUrl(undefined), '');
  assert.strictEqual(maskeerUrl(''), '');
  const m = maskeerUrl('geen-url://user:wachtwoord@host');
  assert.ok(!m.includes('wachtwoord'), m);
});

test('normaliseerUrl: het tafelnummer wordt {N}, zodat tafels vergelijkbaar zijn', () => {
  assert.strictEqual(normaliseerUrl('https://x/pauze/intro.html?table=3', 3), 'https://x/pauze/intro.html?table={N}');
  assert.strictEqual(normaliseerUrl('https://x/a.html?tafel=15&scoresSec=20', 15), 'https://x/a.html?tafel={N}&scoresSec=20');
  // Een ander getal (bijv. table=16 op tafel 1) is een echte afwijking en mag NIET verdwijnen.
  assert.strictEqual(normaliseerUrl('https://x/a.html?table=16', 1), 'https://x/a.html?table=16');
});

test('veiligeInstellingen: een browserbron toont URL, afmeting en verversinstellingen', () => {
  const i = veiligeInstellingen('browser_source', {
    url: 'https://x/pauze/intro.html?table=1', width: 1920, height: 1080,
    restart_when_active: false, shutdown: false, css: '', fps_custom: false,
  });
  assert.deepStrictEqual(i, {
    url: 'https://x/pauze/intro.html?table=1', lokaalBestand: false, breedte: 1920, hoogte: 1080,
    fps: null, verversBijActief: false, stopBijVerborgen: false, css: '',
  });
});

test('veiligeInstellingen: ontbrekende OBS-instellingen zijn de OBS-standaard (uit), geen onbekend', () => {
  // OBS levert in GetInputSettings alleen waarden die van de standaard afwijken.
  const i = veiligeInstellingen('browser_source', { url: 'https://x/a.html', width: 1920, height: 1080 });
  assert.strictEqual(i.verversBijActief, false);
  assert.strictEqual(i.stopBijVerborgen, false);
  // Een expliciet gezette waarde blijft zoals ze is.
  assert.strictEqual(veiligeInstellingen('browser_source', { shutdown: true }).stopBijVerborgen, true);
});

test('veiligeInstellingen: eigen css komt mee (ingekort, op één regel), zodat verschillen zichtbaar zijn', () => {
  const i = veiligeInstellingen('browser_source', { css: 'body {\n  margin: 0;\n}\n' + 'x'.repeat(500) });
  assert.ok(i.css.startsWith('body { margin: 0; }'));
  assert.ok(i.css.length <= 300);
});

test('veiligeInstellingen: slideshow_v2 (de OBS-naam van de sponsor-slideshow) wordt herkend', () => {
  assert.deepStrictEqual(veiligeInstellingen('slideshow_v2', { files: [{}, {}, {}], slide_time: 5000 }), { bestanden: 3, slideTijdMs: 5000 });
});

test('normaliseerNaam: het tafelnummer aan het eind wordt {N}, andere getallen blijven', () => {
  assert.strictEqual(normaliseerNaam('Camera Tafel 15', 15), 'Camera Tafel {N}');
  assert.strictEqual(normaliseerNaam('Camera Tafel 1', 1), 'Camera Tafel {N}');
  assert.strictEqual(normaliseerNaam('Camera Tafel 15', 1), 'Camera Tafel 15'); // 15 is geen 1
  assert.strictEqual(normaliseerNaam('Jumbotron', 1), 'Jumbotron');
});

test('normaliseerUrl: het Cuescore-tableId is per tafel anders en telt niet als verschil', () => {
  assert.strictEqual(
    normaliseerUrl('https://cuescore.com/scoreboard/overlay/?tableId=61403749&lang=nl', 1),
    'https://cuescore.com/scoreboard/overlay/?tableId={ID}&lang=nl',
  );
});

// De situatie van 24-09, zoals het script hem voor het eerst uit de echte OBS's las: dit waren de
// nepverschillen (cameranamen, tableId) én de twee echte (slot op tafel 16, scène op tafel 15).
const echt = (n, { scene = 'Scène', competitieSlot = true, css = '' } = {}) => ({
  tafel: n,
  scene,
  bronnen: [
    { naam: 'Competitiestand', soort: 'browser_source', vergrendeld: competitieSlot, instellingen: { url: `https://x/competitie/?tafel=${n}`, breedte: 1920, hoogte: 1080, verversBijActief: false, stopBijVerborgen: true, css: '' } },
    { naam: 'Jumbotron', soort: 'browser_source', vergrendeld: true, instellingen: { url: `https://x/pauze/slides/02-jumbotron.html?tafel=${n}`, breedte: 1920, hoogte: 1080, verversBijActief: false, stopBijVerborgen: false, css: '' } },
    { naam: 'Scoreboard', soort: 'browser_source', vergrendeld: true, instellingen: { url: `https://cuescore.com/scoreboard/overlay/?tableId=${6140000 + n}&lang=nl`, breedte: 1280, hoogte: 720, verversBijActief: false, stopBijVerborgen: false, css } },
    { naam: `Camera Tafel ${n}`, soort: 'ffmpeg_source', vergrendeld: true, instellingen: {} },
  ],
});

test('vergelijkTafels: cameranamen en tableId per tafel geven GEEN nepverschillen meer', () => {
  const v = vergelijkTafels([1, 3, 15, 16].map((n) => echt(n)));
  assert.deepStrictEqual(v, []);
});

test('vergelijkTafels: een bron die op één tafel niet op slot staat wordt gemeld', () => {
  const v = vergelijkTafels([echt(1), echt(3), echt(15), echt(16, { competitieSlot: false })]).join(' ');
  assert.match(v, /'Competitiestand' staat NIET op slot op tafel 16/);
});

test('vergelijkTafels: een afwijkende scènenaam wordt gemeld, als onschuldig', () => {
  const v = vergelijkTafels([echt(1), echt(15, { scene: 'Scene' })]).join(' ');
  assert.match(v, /scènenaam verschilt/);
  assert.match(v, /onschuldig/);
});

test('vergelijkTafels: verschillende css op het Scoreboard wordt gemeld', () => {
  const v = vergelijkTafels([echt(1), echt(3, { css: 'body { zoom: 2 }' })]).join(' ');
  assert.match(v, /'Scoreboard' verschilt tussen tafels/);
  assert.match(v, /zoom: 2/);
});

test('veiligeInstellingen: van een camerabron komt NIETS mee, ook geen URL met inloggegevens', () => {
  const i = veiligeInstellingen('ffmpeg_source', { input: 'rtsp://beheer:geheim123@10.0.0.5/live', is_local_file: false });
  assert.deepStrictEqual(i, {});
  assert.ok(!JSON.stringify(veiligeInstellingen('dshow_input', { video_device_id: 'x', password: 'geheim' })).includes('geheim'));
});

test('veiligeInstellingen: een slideshow toont alleen aantal en tempo, niet de bestandspaden', () => {
  const i = veiligeInstellingen('image_slideshow', { files: [{ value: 'C:\a.png' }, { value: 'C:\b.png' }], slide_time: 8000 });
  assert.deepStrictEqual(i, { bestanden: 2, slideTijdMs: 8000 });
});

const bron = (naam, url, extra = {}) => ({
  naam, soort: 'browser_source', zichtbaar: true, vergrendeld: true,
  instellingen: { url, breedte: 1920, hoogte: 1080, verversBijActief: false, stopBijVerborgen: false, ...extra },
});

test('vergelijkTafels: gelijke tafels (op het tafelnummer na) geven geen verschillen', () => {
  const tafels = [1, 3].map((n) => ({ tafel: n, bronnen: [bron('Jumbotron', `https://x/j.html?tafel=${n}`), bron('Toernooi-intro', `https://x/i.html?table=${n}`)] }));
  assert.deepStrictEqual(vergelijkTafels(tafels), []);
});

test('vergelijkTafels: een afwijkende URL op één tafel wordt gemeld', () => {
  const tafels = [
    { tafel: 1, bronnen: [bron('Jumbotron', 'https://x/j.html?tafel=1')] },
    { tafel: 3, bronnen: [bron('Jumbotron', 'https://x/j.html?tafel=3')] },
    { tafel: 15, bronnen: [bron('Jumbotron', 'https://x/oud/j.html?tafel=15')] }, // oude versie
  ];
  const v = vergelijkTafels(tafels);
  assert.strictEqual(v.length, 1);
  assert.match(v[0], /Jumbotron.*verschilt/);
  assert.match(v[0], /tafel 15/);
});

test('vergelijkTafels: een instelling die afwijkt (vernieuwen bij actief) wordt gemeld', () => {
  const tafels = [
    { tafel: 1, bronnen: [bron('Toernooi-intro', 'https://x/i.html?table=1')] },
    { tafel: 3, bronnen: [bron('Toernooi-intro', 'https://x/i.html?table=3', { verversBijActief: true })] },
  ];
  assert.strictEqual(vergelijkTafels(tafels).length, 1);
});

test('vergelijkTafels: een ontbrekende bron wordt gemeld', () => {
  const tafels = [
    { tafel: 1, bronnen: [bron('Jumbotron', 'https://x/j.html?tafel=1'), bron('Scoreboard', 'https://x/s.html')] },
    { tafel: 15, bronnen: [bron('Scoreboard', 'https://x/s.html')] },
  ];
  assert.match(vergelijkTafels(tafels).join(' '), /'Jumbotron' ontbreekt op tafel 15/);
});

test('vergelijkTafels: een andere bronvolgorde wordt gemeld', () => {
  const tafels = [
    { tafel: 1, bronnen: [bron('Jumbotron', 'https://x/j.html?tafel=1'), bron('Scoreboard', 'https://x/s.html')] },
    { tafel: 3, bronnen: [bron('Scoreboard', 'https://x/s.html'), bron('Jumbotron', 'https://x/j.html?tafel=3')] },
  ];
  assert.match(vergelijkTafels(tafels).join(' '), /bronvolgorde/);
});

test('vergelijkTafels: een tafel die niet uit te lezen was telt niet mee (geen valse verschillen)', () => {
  const tafels = [
    { tafel: 1, bronnen: [bron('Jumbotron', 'https://x/j.html?tafel=1')] },
    { tafel: 3, fout: 'Connection refused' },
  ];
  assert.deepStrictEqual(vergelijkTafels(tafels), []);
});

test('maakMarkdown: bevat per tafel een tabel, meldt een mislukte tafel en lekt geen geheimen', () => {
  const tafels = [
    { tafel: 1, scene: 'Scène', bronnen: [bron('Jumbotron', 'https://x/j.html?tafel=1')] },
    { tafel: 3, fout: 'Connection refused' },
  ];
  const md = maakMarkdown(tafels, new Date('2026-09-24T12:00:00Z'));
  assert.match(md, /### Tafel 1/);
  assert.match(md, /\| Jumbotron \| browser_source \| ja \| ja \| `https:\/\/x\/j\.html\?tafel=1` \| 1920x1080 \| nee \| nee \|/);
  assert.match(md, /### Tafel 3[\s\S]*Niet uit te lezen: Connection refused/);
  assert.match(md, /2026-09-24/);
});
