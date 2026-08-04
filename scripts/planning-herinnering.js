// Kijkt of er vanavond een toernooi speelt dat nog niet is ingepland (#92), en zet zo ja
// een herinnering klaar als e-mailbestand. Verzenden doet de workflow met curl.
//
// Draait in GitHub Actions maar ook lokaal:
//   ADMIN_TOKEN=... RAPPORT_AAN=... node scripts/planning-herinnering.js --uit mail.txt
//
// Afloopcode 0 = klaar (met of zonder herinnering). Of er iets te versturen is, staat in de
// uitvoer als `versturen=ja|nee` — daar kijkt de workflow naar. Geen herinnering sturen als
// alles goed staat is het belangrijkste kenmerk: een mail die elke dag komt wordt genegeerd.

const fs = require('node:fs');
const { tekort, bericht, onderwerp } = require('../backend/src/rapport/herinnering');

const API = process.env.API_BASE || 'https://mokum-streams-func.azurewebsites.net';

function arg(naam, standaard) {
  const i = process.argv.indexOf(`--${naam}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standaard;
}

(async () => {
  const uit = arg('uit', 'herinnering.txt');
  const token = process.env.ADMIN_TOKEN;
  if (!token) throw new Error('ADMIN_TOKEN ontbreekt');

  const res = await fetch(`${API}/api/manage/planning`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`planning ophalen gaf ${res.status}`);
  const { items } = await res.json();

  const lijst = tekort(items);
  console.log(`toernooien in de planning : ${(items || []).length}`);
  console.log(`nog niet ingepland vandaag: ${lijst.length}`);

  if (!lijst.length) {
    console.log('versturen=nee');
    console.log('Alles staat goed — geen herinnering nodig.');
    return;
  }

  const van = process.env.RAPPORT_VAN || 'pooleninmokum@gmail.com';
  const aan = (process.env.RAPPORT_AAN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!aan.length) throw new Error('RAPPORT_AAN ontbreekt — geen ontvangers');

  fs.writeFileSync(uit, bericht({ lijst, van, aan }), 'utf8');
  console.log('versturen=ja');
  console.log(`onderwerp : ${onderwerp(lijst)}`);
  for (const t of lijst) console.log(`  ${t.start || '—'}  ${t.naam}`);
})().catch((e) => {
  console.error(`Herinnering mislukt: ${e.message}`);
  process.exit(1);
});
