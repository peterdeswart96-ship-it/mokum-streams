// Genereert frontend/public/pauze/slides.json uit de bestanden in public/pauze/slides/.
//
// Waarom dit bestaat: GitHub Pages is een statische host en kan geen map uitlezen,
// dus het pauzescherm heeft een lijstje nodig van welke kaarten er zijn. Dit script
// maakt dat lijstje, zodat een kaart toevoegen niets meer is dan een HTML-bestand
// in slides/ zetten. Zie issue #46.
//
// Elke kaart vertelt zelf hoe hij getoond wil worden, via meta-tags:
//   <meta name="pauze-seconden"  content="15">   hoe lang in beeld (standaard 10)
//   <meta name="pauze-fullbleed" content="1">    kaart vult zelf het scherm -> kop weg
//
// Volgorde = bestandsnaam, vandaar de 01-/02-prefix.
//
// Draaien:  node scripts/gen-pauze-slides.mjs   (gebeurt ook vanzelf bij npm run build)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const slidesDir = path.join(hier, '..', 'public', 'pauze', 'slides');
const uitBestand = path.join(hier, '..', 'public', 'pauze', 'slides.json');

function leesMeta(html, naam) {
  const re = new RegExp(`<meta\\s+name=["']${naam}["']\\s+content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

function leesTitel(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

if (!fs.existsSync(slidesDir)) {
  console.error(`Map niet gevonden: ${slidesDir}`);
  process.exit(1);
}

const slides = fs
  .readdirSync(slidesDir)
  // Alleen .html-kaarten; bestanden met een _-prefix zijn concept/uitgeschakeld en
  // worden overgeslagen (blijven wél in de repo om later te bewerken en terug te zetten).
  .filter((f) => f.toLowerCase().endsWith('.html') && !f.startsWith('_'))
  .sort()
  .map((f) => {
    const html = fs.readFileSync(path.join(slidesDir, f), 'utf8');
    const seconden = Number(leesMeta(html, 'pauze-seconden'));
    return {
      file: f,
      titel: leesTitel(html) || f,
      seconden: Number.isFinite(seconden) && seconden > 0 ? seconden : 10,
      fullbleed: leesMeta(html, 'pauze-fullbleed') === '1',
    };
  });

if (slides.length === 0) {
  console.error('Geen kaarten gevonden — slides.json niet geschreven.');
  process.exit(1);
}

fs.writeFileSync(uitBestand, JSON.stringify(slides, null, 2) + '\n', 'utf8');
console.log(`${slides.length} kaart(en) -> public/pauze/slides.json`);
for (const s of slides) {
  console.log(`  ${s.file.padEnd(24)} ${String(s.seconden).padStart(2)}s  ${s.fullbleed ? '(fullbleed)' : ''}  ${s.titel}`);
}
