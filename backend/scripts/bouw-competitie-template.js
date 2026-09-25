#!/usr/bin/env node
// Bouwt de thumbnail-template voor een competitiewedstrijd (#82):
// backend/assets/thumbnail-templates/competitie.html.
//
// Anders dan de toernooi-templates komt deze niet uit een Artifact-bundle, maar uit twee losse
// plaatjes in docs/ontwerp/competitie/:
//  - achtergrond.jpg  — de AI-afbeelding (Google AI) met links lege ruimte voor de tekst
//  - knbb-logo.png    — het KNBB-schild; heeft een ZWARTE achtergrond, die maken we hier transparant
// Het Anton-font lenen we uit challenge-match.html, zodat de familie gelijk blijft.
// Alles wordt als data:-URI ingebed, zodat de renderer zonder externe bestanden werkt.
//
// Nieuwe achtergrond of logo? Vervang het bestand en draai:
//   node backend/scripts/bouw-competitie-template.js

const fs = require('fs');
const path = require('path');
const { loadImage, createCanvas } = require('@napi-rs/canvas');

const BRON = path.join(__dirname, '..', '..', 'docs', 'ontwerp', 'competitie');
const TEMPLATES = path.join(__dirname, '..', 'assets', 'thumbnail-templates');

// Alle @font-face-blokken van Anton uit een bestaande template.
function antonFontFaces() {
  const html = fs.readFileSync(path.join(TEMPLATES, 'challenge-match.html'), 'utf8');
  const blokken = html.match(/@font-face\s*\{[^}]*font-family:\s*'Anton'[^}]*\}/g) || [];
  if (!blokken.length) throw new Error('geen Anton-font gevonden in challenge-match.html');
  return blokken.join('\n');
}

// Maakt (bijna) zwarte pixels transparant, met een zachte overgang zodat de rand van het
// schild niet rafelig wordt. Het schild zelf bevat geen zwart, dus dat blijft heel.
async function logoZonderZwart(bestand) {
  const img = await loadImage(bestand);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const beeld = ctx.getImageData(0, 0, img.width, img.height);
  const p = beeld.data;
  const ONDER = 18, BOVEN = 60; // helderheid: <ONDER = weg, >BOVEN = volledig zichtbaar
  for (let i = 0; i < p.length; i += 4) {
    const helder = Math.max(p[i], p[i + 1], p[i + 2]);
    if (helder <= ONDER) p[i + 3] = 0;
    else if (helder < BOVEN) p[i + 3] = Math.round(p[i + 3] * (helder - ONDER) / (BOVEN - ONDER));
  }
  ctx.putImageData(beeld, 0, 0);
  return `data:image/png;base64,${c.toBuffer('image/png').toString('base64')}`;
}

async function bouw() {
  const achtergrond = `data:image/jpeg;base64,${fs.readFileSync(path.join(BRON, 'achtergrond.jpg')).toString('base64')}`;
  const logo = await logoZonderZwart(path.join(BRON, 'knbb-logo.png'));

  // .niveau is de gekleurde pil rechts van het logo. .info is het tekstvak links. De renderer (thumbnailHtml.js) verkleint .team-regels als
  // lange teamnamen niet in dat vak passen.
  const css = [
    'body{margin:0;width:1280px;height:720px;overflow:hidden}',
    ".canvas{position:relative;width:1280px;height:720px;overflow:hidden;background:#0a0a0a;font-family:'Anton','Arial Black',sans-serif}",
    '.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:right center}',
    '.logorij{position:absolute;left:56px;top:36px;height:150px;display:flex;align-items:center;gap:22px;z-index:4}',
    '.logo{height:150px;filter:drop-shadow(0 6px 18px rgba(0,0,0,.6))}',
    '.niveau{background:{{NIVEAUKLEUR}};border-radius:40px;padding:12px 32px;font-size:40px;color:#fff;letter-spacing:2px;text-transform:uppercase;white-space:nowrap;box-shadow:0 6px 22px rgba(0,0,0,.55)}',
    // Tekstvak: vast tussen de onderkant van het logo (186px) en de bovenkant van de datumpil (592px), met de tekst er verticaal gecentreerd in.
    // Alle regels staan op dezelfde afstand (gap) van elkaar; de renderer verkleint tekst en
    // afstand samen als de namen niet passen, zodat de verhoudingen altijd gelijk blijven.
    '.info{position:absolute;left:56px;top:206px;height:366px;width:510px;display:flex;flex-direction:column;justify-content:center;gap:14px;z-index:2;overflow:hidden}',
    '.team{font-size:88px;line-height:0.95;color:#fff;text-transform:uppercase;letter-spacing:1px;text-shadow:0 4px 24px rgba(0,0,0,.55);overflow-wrap:break-word}',
    '.vs{font-size:52px;color:#ff2b2b;line-height:1;letter-spacing:2px}',
    '.datepill{position:absolute;left:56px;bottom:44px;background:#cc0000;border-radius:40px;padding:12px 32px;font-size:40px;color:#fff;letter-spacing:2px;z-index:4;box-shadow:0 6px 22px rgba(0,0,0,.55)}',
  ].join('');

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><style>${antonFontFaces()}</style><style>${css}</style></head>`
    + `<body><div class="canvas"><img class="bg" src="${achtergrond}"><div class="logorij"><img class="logo" src="${logo}"><div class="niveau">{{NIVEAU}}</div></div>`
    + '<div class="info"><div class="team">{{THUISTEAM}}</div>'
    + '<div class="vs">VS</div><div class="team">{{UITTEAM}}</div></div>'
    + '<div class="datepill">{{DATUM}}</div></div></body></html>';

  const doel = path.join(TEMPLATES, 'competitie.html');
  fs.writeFileSync(doel, html);
  console.log(`competitie.html geschreven (${Math.round(html.length / 1024)} KB)`);
}

bouw().catch((e) => { console.error(e); process.exit(1); });
