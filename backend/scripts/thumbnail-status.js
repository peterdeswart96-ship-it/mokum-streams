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

  const zonder = inv.rows.filter((r) => !r.thumbnail);
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
    uit.push('| Datum | Duur | Titel | Video |');
    uit.push('|---|---|---|---|');
    for (const r of rijen.sort((a, b) => String(b.datum).localeCompare(String(a.datum)))) {
      uit.push(`| ${r.datum || '?'} | ${mmss(r.durationSec)} | ${veilig(r.naam)} | \`${r.videoId}\` |`);
    }
    uit.push('');
  }

  fs.writeFileSync('thumbnail-status.md', uit.join('\n'), 'utf8');
  fs.writeFileSync('thumbnail-status.json', JSON.stringify({
    stand: new Date().toISOString(),
    totaal: inv.aantal, metThumbnail: inv.metThumbnail, zonderThumbnail: zonder.length,
    groepen: Object.fromEntries(GROEPEN.map((g) => [g.sleutel, ingedeeld.get(g.sleutel)])),
    reeksen: Object.fromEntries([...perReeks].map(([k, v]) => [k, v.map((r) => r.videoId)])),
  }, null, 2), 'utf8');

  console.log(`${inv.aantal} video's, ${inv.metThumbnail} met thumbnail, ${zonder.length} zonder.`);
  for (const g of GROEPEN) console.log(`  ${String(ingedeeld.get(g.sleutel).length).padStart(4)}  ${g.titel}`);
  console.log(`\nGeschreven: ${path.resolve('thumbnail-status.md')} + .json`);
})();
