// Genereert de QR-codes voor de quickstart-vellen (public/quickstart/qr/*.svg).
//
// Waarom een script en geen plaatje dat iemand ooit heeft gedownload: een QR-code is een
// URL in beeldvorm. Verandert een adres, dan moet de code mee — en dan wil je niet zoeken
// naar welke website hem ooit gemaakt heeft. Hier staat de bron in de repo.
//
// SVG en geen PNG: een QR-code is een raster van vierkantjes. Als SVG blijft hij bij elk
// printformaat vlijmscherp; een PNG wordt op A4 al snel rafelig, en juist dan wil je dat
// een telefoon hem in één keer pakt.
//
// De URL's krijgen ?utm_source=qr mee. De pagina's sturen die door naar /api/hit, dus in
// het dashboard (GET /api/manage/stats) zie je terug hoe vaak er bij de kassa gescand is.
// Zonder die parameter telt een scan als 'direct' en weet je niet waar het vandaan komt.
//
// Draaien:  node scripts/gen-quickstart-qr.mjs   (gebeurt ook vanzelf bij npm run build)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const hier = path.dirname(fileURLToPath(import.meta.url));
const uitMap = path.join(hier, '..', 'public', 'quickstart', 'qr');

const BASIS = 'https://mokum-streams.pdscloud.nl';

// Eén regel per vel. `bestand` is de naam van de svg, `pad` het adres op de site.
const CODES = [
  { bestand: 'mokumlive', pad: '/mokumlive/' },
  { bestand: 'archief', pad: '/archief/' },
  { bestand: 'challenge', pad: '/challenge.html' },
  // De quickstart zelf, voor op het vel over het startscherm: zo kan iemand de uitleg
  // op zijn eigen telefoon openen in plaats van over het papier gebogen te staan.
  { bestand: 'quickstart', pad: '/quickstart/' },
];

// Foutcorrectieniveau M (~15% herstel). Hoger niveau maakt de code dichter en dus lastiger
// te scannen op afstand; M is ruim genoeg voor een vel dat op een toonbank ligt en tegen
// een vlek of een vouw moet kunnen.
const OPTIES = { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } };

fs.mkdirSync(uitMap, { recursive: true });

for (const { bestand, pad } of CODES) {
  const url = `${BASIS}${pad}${pad.includes('?') ? '&' : '?'}utm_source=qr`;
  const svg = await QRCode.toString(url, OPTIES);
  fs.writeFileSync(path.join(uitMap, `${bestand}.svg`), svg, 'utf8');
  console.log(`${bestand.padEnd(12)} -> ${url}`);
}

console.log(`\n${CODES.length} QR-codes geschreven naar public/quickstart/qr/`);
