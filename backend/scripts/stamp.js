// Schrijft src/deploy-info.json met de commit die gedeployed wordt (#79).
//
// Waarom dit bestaat: op Flex Consumption draait de app vanuit een pakket, dus je kunt
// van buitenaf niet zien welke code er staat. Op 27 en 28 juli kostte dat twee finales:
// de CI meldde groen terwijl de backend-deploy een placeholder was, en niemand kon
// controleren dat de fix er niet stond. Sindsdien stempelen we elke deploy, en geeft
// /api/health die stempel terug.
//
// Draai dit vlak vóór het publiceren:  npm run stamp
// De CI-workflow doet hetzelfde met de SHA van de commit die gebouwd wordt.
// Het bestand staat in .gitignore — het hoort bij een deploy, niet bij de broncode.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function huidigeCommit() {
  if (process.env.DEPLOY_COMMIT) return process.env.DEPLOY_COMMIT;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'onbekend'; // geen git beschikbaar (bijv. in een kale buildomgeving)
  }
}

const info = {
  commit: huidigeCommit(),
  tijd: new Date().toISOString().slice(0, 16) + 'Z',
};

const doel = path.join(__dirname, '..', 'src', 'deploy-info.json');
fs.writeFileSync(doel, `${JSON.stringify(info, null, 2)}\n`);
console.log(`[stamp] deploy-info.json geschreven: commit ${info.commit} (${info.tijd})`);
