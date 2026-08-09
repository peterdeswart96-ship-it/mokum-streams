#!/usr/bin/env node
// Stand van zaken thumbnails (#66): welke kanaal-video's missen er nog een, en waaróm.
// Read-only — dit script verandert niets, het kijkt alleen.
//
// Nodig: env ADMIN_TOKEN (Bearer voor de admin-endpoints).
// Draaien:  $env:ADMIN_TOKEN = "<token>"; node backend/scripts/thumbnail-status.js
//
// Schrijft twee bestanden in de map waar je het draait:
//  - thumbnail-status.md    leesbaar overzicht, per groep een tabel
//  - thumbnail-status.json  dezelfde indeling mét video-id's, als invoer voor opruimacties
//
// Het rapport heeft twee helften. De eerste gaat over thumbnails; de tweede over
// ZICHTBAARHEID — welke video's staan openbaar en dus op youtube.com/@MokumPoolDarts/streams.
// Die twee lopen niet gelijk: een video kan een keurige thumbnail hebben en toch verborgen
// staan, of naamloos zijn en toch openbaar. Voor opschonen telt alleen de tweede.
//
// Waarom deze indeling: "196 video's zonder thumbnail" zegt niets zolang je niet weet of er
// iets aan te doen is. De groepen hieronder scheiden "er is een ontwerp, dit kan meteen" van
// "hier moet eerst een ontwerp of een invoerbron komen" van "hier valt niks te maken".

const fs = require('fs');
const path = require('path');
const { templateVoorToernooi } = require('../src/video/detectie');

const API = process.env.API_BASIS || 'https://mokum-streams-func.azurewebsites.net';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('ADMIN_TOKEN ontbreekt (env).'); process.exit(1); }

// ── Indeling ──────────────────────────────────────────────────────────────────
// De inventarisatie zelf noemt álles met "vs" in de titel een challenge; daar vallen de
// teamcompetities ten onrechte onder. Vandaar dat we hier opnieuw indelen.
const GROEPEN = [
  { sleutel: 'kan-nu',        titel: 'Ontwerp bestaat — kan meteen',
    hoort: (t) => Boolean(templateVoorToernooi(t)) },
  { sleutel: 'teamcompetitie', titel: 'Teamcompetitie — wacht op ontwerp (#82)',
    hoort: (t) => /\b(divisie|klasse|rechalk|eredivisie)\b/i.test(t) },
  { sleutel: 'naamloos',      titel: 'Alleen "Tafel N" — geen titel om iets mee te maken',
    hoort: (t) => /^\s*tafel\s*\d+\s*$/i.test(t) },
  { sleutel: 'test',          titel: 'Test-uitzendingen — kunnen weg',
    hoort: (t) => /mijn uitzending|my broadcast|^\s*test\s*$/i.test(t) },
  { sleutel: 'losse-partij',  titel: 'Losse partij of challenge — wacht op invoerbron (#70)',
    hoort: (t) => /\bchallenge/i.test(t) || /^[^-]{2,30}\s[-–]\s[^-]{2,30}$/.test(t) },
  { sleutel: 'geen-ontwerp',  titel: 'Toernooi met een titel die geen ontwerp heeft',
    hoort: () => true },  // vangnet, moet als laatste staan
];

// Terugkerende reeksen binnen "geen ontwerp". Eén nieuw ontwerp dekt een hele reeks, dus dit
// is de lijst waarop je prioriteert.
const REEKSEN = [
  ['Mokum 8-ball Ranking',              /8\s*-?\s*ball\s*ranking/i],
  ['9-ball Sunday',                     /9\s*-?\s*ball\s*sunday|sunday.*9\s*-?\s*ball/i],
  ['Mokum Ranking 9-Ball First Edition', /first\s*edition/i],
  ['NK Pool kwalificatie',              /nk\s*pool/i],
  ['Mokum One Pocket Monthly',          /one\s*pocket/i],
  ['Mokum Mini (vrijdag/8ball/10ball)', /\bmini\b/i],
  ['Mokum 10-ball Ranking',             /10\s*-?\s*ball\s*ranking/i],
  ['Mega Ranking (zonder Buffalo/Summer)', /\bmega\b/i],
  ['Mokum Race to 11',                  /race\s*to/i],
];

const mmss = (s) => {
  if (s == null) return '?';
  const u = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${u}u ${String(m).padStart(2, '0')}m`;
};
const veilig = (s) => String(s || '').replace(/\|/g, '\\|');

(async () => {
  const res = await fetch(`${API}/api/manage/inventory`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) { console.error(`inventory faalde: HTTP ${res.status}`); process.exit(1); }
  const inv = await res.json();

  // Lopende en net afgelopen uitzendingen zijn GEEN achterstand: die krijgen hun thumbnail
  // straks van de automatische afronding. Zonder dit onderscheid tel je elke avond dat er
  // gestreamd wordt vier video's te veel, en ga je dingen met de hand doen die vanzelf
  // gebeuren. (Precies dat gebeurde op 09-08 met twee MEGA Ranking-uitzendingen.)
  const AFRONDING_GRACE_MS = 2 * 60 * 60 * 1000;
  const nu = Date.now();
  const wachtOpAfronding = (r) => {
    if (r.loopt) return true;
    if (!r.geeindigd) return false;
    const eind = Date.parse(r.geeindigd);
    return Number.isFinite(eind) && (nu - eind) < AFRONDING_GRACE_MS;
  };

  const alZonder = inv.rows.filter((r) => !r.thumbnail);
  const bezig = alZonder.filter(wachtOpAfronding);
  const zonder = alZonder.filter((r) => !wachtOpAfronding(r));

  const ingedeeld = new Map(GROEPEN.map((g) => [g.sleutel, []]));
  for (const r of zonder) {
    const g = GROEPEN.find((x) => x.hoort(r.naam || ''));
    ingedeeld.get(g.sleutel).push(r);
  }

  // Binnen "geen ontwerp": welke reeksen komen vaak terug?
  const perReeks = new Map();
  const losse = [];
  for (const r of ingedeeld.get('geen-ontwerp')) {
    const hit = REEKSEN.find(([, re]) => re.test(r.naam || ''));
    if (!hit) { losse.push(r); continue; }
    if (!perReeks.has(hit[0])) perReeks.set(hit[0], []);
    perReeks.get(hit[0]).push(r);
  }

  // ── Markdown ────────────────────────────────────────────────────────────────
  const uit = [];
  uit.push(`# Video's zonder thumbnail — stand ${new Date().toISOString().slice(0, 10)}\n`);
  uit.push(`${inv.aantal} video's op het kanaal, ${inv.metThumbnail} met onze thumbnail, **${zonder.length} zonder**.`);
  uit.push(`Hoofdstukken: ${inv.metHoofdstukken} van ${inv.aantal}.\n`);
  if (bezig.length) {
    uit.push(`> ${bezig.length} uitzending(en) lopen nog of zijn net afgelopen. Die tellen hier niet mee —`);
    uit.push('> de automatische afronding zet er straks zelf een thumbnail op:\n');
    for (const r of bezig) uit.push(`> - ${r.loopt ? 'LIVE' : 'net klaar'} · ${veilig(r.naam)} (\`${r.videoId}\`)`);
    uit.push('');
  }
  uit.push('| Groep | Aantal |');
  uit.push('|---|---:|');
  for (const g of GROEPEN) uit.push(`| ${g.titel} | ${ingedeeld.get(g.sleutel).length} |`);
  uit.push('');

  if (perReeks.size) {
    uit.push('## Reeksen die een ontwerp zouden verdienen\n');
    uit.push('| Reeks | Aantal | Van | Tot |');
    uit.push('|---|---:|---|---|');
    for (const [naam, rijen] of [...perReeks].sort((a, b) => b[1].length - a[1].length)) {
      const d = rijen.map((r) => r.datum).filter(Boolean).sort();
      uit.push(`| ${naam} | ${rijen.length} | ${d[0] || '?'} | ${d[d.length - 1] || '?'} |`);
    }
    uit.push(`\nLosse titels zonder reeks: ${losse.length}.\n`);
  }

  for (const g of GROEPEN) {
    const rijen = ingedeeld.get(g.sleutel);
    if (!rijen.length) continue;
    uit.push(`## ${g.titel} — ${rijen.length}\n`);
    uit.push('| Datum | Duur | Titel | Zicht | Video |');
    uit.push('|---|---|---|---|---|');
    for (const r of rijen.sort((a, b) => String(b.datum).localeCompare(String(a.datum)))) {
      uit.push(`| ${r.datum || '?'} | ${mmss(r.durationSec)} | ${veilig(r.naam)} | ${r.zichtbaarheid || '?'} | \`${r.videoId}\` |`);
    }
    uit.push('');
  }

  // ── Tweede helft: wat staat er openbaar? ────────────────────────────────────
  // Dit is de streams-tab. Alleen `public` telt: verborgen video's bestaan wel, maar een
  // bezoeker ziet ze niet staan. Bewust los van de thumbnail-indeling hierboven — voor
  // opschonen maakt het niet uit of er een thumbnail op zit.
  const openbaar = inv.rows.filter((r) => r.zichtbaarheid === 'public');
  const perCat = new Map();
  for (const r of openbaar) {
    const k = r.categorie || 'overig';
    if (!perCat.has(k)) perCat.set(k, []);
    perCat.get(k).push(r);
  }

  uit.push('# Wat staat er openbaar (de streams-tab)\n');
  uit.push(Object.entries(inv.perZichtbaarheid || {}).map(([k, v]) => `**${v}** ${k}`).join(' · ') + '\n');
  uit.push('| Categorie | Openbaar | Waarvan zonder thumbnail |');
  uit.push('|---|---:|---:|');
  for (const [k, v] of [...perCat].sort((a, b) => b[1].length - a[1].length)) {
    uit.push(`| ${k} | ${v.length} | ${v.filter((r) => !r.thumbnail).length} |`);
  }
  uit.push('');

  for (const [k, v] of [...perCat].sort((a, b) => b[1].length - a[1].length)) {
    uit.push(`## Openbaar — ${k} (${v.length})\n`);
    uit.push('| Datum | Duur | Titel | Thumb | Video |');
    uit.push('|---|---|---|---|---|');
    for (const r of v.sort((a, b) => String(b.datum).localeCompare(String(a.datum)))) {
      uit.push(`| ${r.datum || '?'} | ${mmss(r.durationSec)} | ${veilig(r.naam)} | ${r.thumbnail ? 'ja' : '—'} | \`${r.videoId}\` |`);
    }
    uit.push('');
  }

  fs.writeFileSync('thumbnail-status.md', uit.join('\n'), 'utf8');
  fs.writeFileSync('thumbnail-status.json', JSON.stringify({
    stand: new Date().toISOString(),
    totaal: inv.aantal, metThumbnail: inv.metThumbnail, zonderThumbnail: zonder.length,
    wachtOpAfronding: bezig,
    perZichtbaarheid: inv.perZichtbaarheid || {},
    groepen: Object.fromEntries(GROEPEN.map((g) => [g.sleutel, ingedeeld.get(g.sleutel)])),
    reeksen: Object.fromEntries([...perReeks].map(([k, v]) => [k, v.map((r) => r.videoId)])),
    // Per categorie de OPENBARE video's — invoer voor naar-diversen.js.
    openbaar: Object.fromEntries([...perCat].map(([k, v]) => [k, v])),
  }, null, 2), 'utf8');

  console.log(`${inv.aantal} video's, ${inv.metThumbnail} met thumbnail, ${zonder.length} zonder.`);
  if (bezig.length) {
    console.log(`  (${bezig.length} lopen nog of zijn net klaar — niet meegeteld, de afronding komt nog)`);
    for (const r of bezig) console.log(`      ${r.loopt ? 'LIVE     ' : 'net klaar'}  ${r.videoId}  ${(r.naam || '').slice(0, 55)}`);
  }
  for (const g of GROEPEN) console.log(`  ${String(ingedeeld.get(g.sleutel).length).padStart(4)}  ${g.titel}`);
  console.log(`\nZichtbaarheid: ${Object.entries(inv.perZichtbaarheid || {}).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  console.log(`Openbaar (= de streams-tab): ${openbaar.length}`);
  for (const [k, v] of [...perCat].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(v.length).padStart(4)}  ${k}`);
  }
  console.log(`\nGeschreven: ${path.resolve('thumbnail-status.md')} + .json`);
})();
