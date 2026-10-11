#!/usr/bin/env node
// Bouwt de thumbnail-template voor de KNBB Regio Ranking (Noord-Holland, regio 2):
// backend/assets/thumbnail-templates/knbb-regio-ranking.html.
//
// Zelfde opzet als de competitie-template (KNBB-logo linksboven, rode datumpil linksonder,
// Anton-font), maar met een eigen achtergrond (Pixar-stijl handdruk, Google AI) en een vaste
// titel in plaats van teamnamen. Daarom bouwen we voort op competitie.html:
// draai dus eerst bouw-competitie-template.js als die template zelf is aangepast.
//
// Nieuwe achtergrond? Vervang docs/ontwerp/knbb-ranking/achtergrond.jpg en draai:
//   node backend/scripts/bouw-knbb-ranking-template.js

const fs = require('fs');
const path = require('path');

const BRON = path.join(__dirname, '..', '..', 'docs', 'ontwerp', 'knbb-ranking', 'achtergrond.jpg');
const TEMPLATES = path.join(__dirname, '..', 'assets', 'thumbnail-templates');

const achtergrond = `data:image/jpeg;base64,${fs.readFileSync(BRON).toString('base64')}`;
let html = fs.readFileSync(path.join(TEMPLATES, 'competitie.html'), 'utf8');

html = html
  // Andere achtergrond.
  .replace(/(<img class="bg" src=")[^"]+"/, `$1${achtergrond}"`)
  // Geen niveau-pil: de titel zegt al wat het is.
  .replace(/<div class="niveau">[^<]*<\/div>/, '')
  // Vaste titel i.p.v. thuisteam / VS / uitteam. De renderer verkleint .team zo nodig.
  .replace(/<div class="info">[\s\S]*?<div class="team">\{\{UITTEAM\}\}<\/div><\/div>/,
    '<div class="info"><div class="team">KNBB REGIO RANKING</div><div class="team" style="color:#ff2b2b">NH REGIO 2</div></div>');

if (html.includes('{{THUISTEAM}}') || html.includes('{{NIVEAU}}')) throw new Error('competitie.html heeft een andere opbouw: pas de vervangingen aan');

fs.writeFileSync(path.join(TEMPLATES, 'knbb-regio-ranking.html'), html);
console.log(`knbb-regio-ranking.html geschreven (${Math.round(html.length / 1024)} KB)`);
