#!/usr/bin/env node
// Bouwt de self-contained thumbnail-templates (#56) uit de Claude-Artifact "bundler"-exports
// die in docs/ontwerp/thumbnail-bundles/ staan (bewust BUITEN de webroot, zodat GitHub Pages
// deze ~270 KB-bronbestanden niet publiek serveert). Elke export bevat de schone artifact-HTML in een
// <script type="__bundler/template"> plus alle assets (fonts, logo's) in __bundler/manifest.
// Dit script haalt die HTML eruit en vervangt elke asset-verwijzing door een ingebedde
// data:-URI, zodat de backend de template zonder externe bestanden kan renderen.
//
// De placeholders {{TOERNOOINAAM}} / {{DATUM}} / {{SPELERS}} / {{SPONSOR}} blijven staan;
// die vult de renderer (thumbnailHtml.js) per video in.
//
// Draai dit opnieuw zodra je in frontend/public/ een ontwerp toevoegt of vervangt:
//   node backend/scripts/bouw-thumbnail-templates.js
//
// Bron van waarheid = de bundles in docs/ontwerp/thumbnail-bundles/ (die bewerk je in de
// Artifact-editor). Uitvoer = backend/assets/thumbnail-templates/*.html (deployt mee met de backend).

const fs = require('fs');
const path = require('path');

const BRON = path.join(__dirname, '..', '..', 'docs', 'ontwerp', 'thumbnail-bundles');
const DOEL = path.join(__dirname, '..', 'assets', 'thumbnail-templates');

function scriptBody(html, type) {
  const re = new RegExp(`<script type="${type}">([\\s\\S]*?)</script>`);
  const m = html.match(re);
  return m ? m[1] : null;
}

// Huisstijl-regels die op ELKE template worden toegepast (op de schone HTML, vóór asset-
// inlining). Zo hoeven we de losse Artifact-bundles niet te bewerken en blijft het ontwerp
// centraal + reproduceerbaar. Aanpassen = hier één regel wijzigen, extractor opnieuw draaien.
function huisstijl(html) {
  // Titel groot en consistent (100→150px) + auto-verkleinen uit — we gebruiken vaste,
  // korte titels per template, dus het meten-vóór-font-laadt-verkleinen is niet nodig.
  html = html.replace(
    'font-size:100px;color:#cc0000;line-height:1.04;margin-top:10px;transform:rotate(-2deg);max-height:240px',
    'font-size:150px;color:#cc0000;line-height:1.02;margin-top:10px;transform:rotate(-2deg);max-height:360px');
  html = html.replace(/<div class="brushbar"><\/div>/g, '');           // rode streep weg
  html = html.replace(/while\(t\.scrollHeight>t\.clientHeight\+4&&s>40\)\{s-=4;t\.style\.fontSize=s\+'px'\}/g, '');
  return html;
}

// Aanpassingen die maar op één template gelden.
const PER_TEMPLATE = {
  // Fluke: klavertje 4 + hoefijzer weg.
  'fluke-ranking': (h) => h.replace(
    /<div style="position:absolute;left:1090px;top:170px;transform:rotate\(12deg\)">[\s\S]*?transform:rotate\(200deg\)"><\/div>/,
    ''),
  // MEGA Ranking: de "I.S.M. Buffalo"-chip weg (Buffalo sponsort dit toernooi niet).
  'mega-ranking-buffalo': (h) => h.replace(/<div class="extra">[\s\S]*?<\/div>/, ''),
};

// Zet één bundle om naar een self-contained template. Retourneert een korte rapportregel.
function bouw(bronPad, doelPad) {
  const html = fs.readFileSync(bronPad, 'utf8');
  const tplRaw = scriptBody(html, '__bundler/template');
  if (!tplRaw) return null; // geen thumbnail-bundle

  let tpl = JSON.parse(tplRaw.trim());
  const manifest = JSON.parse(scriptBody(html, '__bundler/manifest') || '{}');

  // Huisstijl + per-template aanpassingen op de schone HTML (vóór asset-inlining).
  tpl = huisstijl(tpl);
  const key = path.basename(doelPad).replace(/\.html$/, '');
  if (PER_TEMPLATE[key]) tpl = PER_TEMPLATE[key](tpl);

  const gemist = new Set();
  let ingebed = 0;
  const inline = (id) => {
    const a = manifest[id];
    if (!a || !a.data) { gemist.add(id); return null; }
    ingebed++;
    return `data:${a.mime};base64,${a.data}`;
  };

  // fonts via url("id") en afbeeldingen via src="id" (36-teken UUID's)
  tpl = tpl.replace(/(url\(["']?|src=["'])([0-9a-f-]{36})(["']?\)?)/g, (full, pre, id, post) => {
    const uri = inline(id);
    return uri ? `${pre}${uri}${post}` : full;
  });

  fs.writeFileSync(doelPad, tpl);
  const ph = [...new Set(tpl.match(/\{\{[A-Z]+\}\}/g) || [])];
  return `${path.basename(doelPad).padEnd(32)} ${(tpl.length / 1024).toFixed(0).padStart(3)} KB | assets: ${ingebed} | ${ph.join(',') || '-'}${/data-players/.test(tpl) ? ' +players' : ''}${gemist.size ? ' | GEMIST: ' + [...gemist].join(',') : ''}`;
}

function main() {
  fs.mkdirSync(DOEL, { recursive: true });
  const bestanden = fs.readdirSync(BRON).filter((f) => f.endsWith('.html'));
  let n = 0;
  for (const f of bestanden) {
    const bronPad = path.join(BRON, f);
    // alleen echte thumbnail-bundles (hebben __bundler/template)
    if (!fs.readFileSync(bronPad, 'utf8').includes('__bundler/template')) continue;
    const regel = bouw(bronPad, path.join(DOEL, f));
    if (regel) { console.log(regel); n++; }
  }
  console.log(`\n${n} template(s) geschreven naar ${path.relative(process.cwd(), DOEL)}`);
}

main();
