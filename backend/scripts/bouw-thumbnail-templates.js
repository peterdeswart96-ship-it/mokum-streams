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

// Zet één bundle om naar een self-contained template. Retourneert een korte rapportregel.
function bouw(bronPad, doelPad) {
  const html = fs.readFileSync(bronPad, 'utf8');
  const tplRaw = scriptBody(html, '__bundler/template');
  if (!tplRaw) return null; // geen thumbnail-bundle

  let tpl = JSON.parse(tplRaw.trim());
  const manifest = JSON.parse(scriptBody(html, '__bundler/manifest') || '{}');

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
