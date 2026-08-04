// Bouwt het ochtendrapport en zet het klaar als e-mailbestand (#91).
//
// Draait in GitHub Actions (elke ochtend) maar ook gewoon lokaal. Haalt de logregels van de
// afgelopen avond uit Log Analytics, laat backend/src/rapport de duiding en analyse doen, en
// schrijft het resultaat naar een bestand dat curl rechtstreeks aan de SMTP-server voert.
//
// Verzenden zit hier BEWUST niet in: het wachtwoord hoort in de secrets van de workflow en
// niet in Node-code die per ongeluk iets kan loggen.
//
// Gebruik:
//   node scripts/avond-mail.js --datum 2026-08-03 --uit mail.txt
//
// Verwacht in de omgeving:
//   LOG_TOKEN        toegangstoken voor api.loganalytics.io
//   WERKRUIMTE_ID    customerId van de Log Analytics-werkruimte
//   RAPPORT_VAN      afzenderadres
//   RAPPORT_AAN      ontvangers, komma-gescheiden

const fs = require('node:fs');
const { analyseer } = require('../backend/src/rapport/duiding');
const { bericht, onderwerp } = require('../backend/src/rapport/mail');

function arg(naam, standaard) {
  const i = process.argv.indexOf(`--${naam}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standaard;
}

// Gisteren in Amsterdamse tijd — het rapport gaat 's ochtends over de avond ervoor.
function gisteren() {
  const nu = new Date(Date.now() - 24 * 3600 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}

// Het venster loopt van 12:00 tot 08:00 de volgende ochtend, zodat een avond die na
// middernacht doorloopt in één rapport blijft — dezelfde zaal-dag-gedachte als in de backend.
// De offset van Amsterdam halen we op bij de datum zelf, zodat zomer- en wintertijd kloppen.
function venster(datum) {
  const offsetUren = (d) => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' });
    const naam = f.formatToParts(d).find((p) => p.type === 'timeZoneName').value; // "GMT+02:00"
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(naam);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60) : 0;
  };
  const ruw = new Date(`${datum}T12:00:00Z`);
  const off = offsetUren(ruw);
  const van = new Date(Date.parse(`${datum}T12:00:00Z`) - off * 3600 * 1000);
  return { van, tot: new Date(van.getTime() + 20 * 3600 * 1000) };
}

async function haalLogregels(datum) {
  const token = process.env.LOG_TOKEN;
  const werkruimte = process.env.WERKRUIMTE_ID;
  if (!token || !werkruimte) throw new Error('LOG_TOKEN of WERKRUIMTE_ID ontbreekt');

  const { van, tot } = venster(datum);
  const query = [
    'AppTraces',
    `| where TimeGenerated between (datetime(${van.toISOString()}) .. datetime(${tot.toISOString()}))`,
    "| where Message startswith '['",
    "| where Message !contains 'niets te doen'",
    '| project TimeGenerated, Message',
    '| order by TimeGenerated asc',
  ].join(' ');

  const res = await fetch(`https://api.loganalytics.io/v1/workspaces/${werkruimte}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Log Analytics gaf ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const tabel = (data.tables || [])[0];
  if (!tabel) return [];
  const kol = Object.fromEntries(tabel.columns.map((c, i) => [c.name, i]));
  return tabel.rows.map((r) => ({ tijd: new Date(r[kol.TimeGenerated]), bericht: r[kol.Message] }));
}

(async () => {
  const datum = arg('datum', gisteren());
  const uit = arg('uit', 'mail.txt');

  const regels = await haalLogregels(datum);
  const analyse = analyseer(regels);

  const van = process.env.RAPPORT_VAN || 'pooleninmokum@gmail.com';
  const aan = (process.env.RAPPORT_AAN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!aan.length) throw new Error('RAPPORT_AAN ontbreekt — geen ontvangers');

  fs.writeFileSync(uit, bericht({ datum, analyse, van, aan }), 'utf8');

  // Naar de workflow-log, zodat je in GitHub kunt zien wat er verstuurd is zonder de mail
  // te openen. Geen adressen of geheimen, alleen de uitkomst.
  console.log(`datum        : ${datum}`);
  console.log(`logregels    : ${regels.length}`);
  console.log(`onderwerp    : ${onderwerp(datum, analyse)}`);
  console.log(`bevindingen  : ${analyse.bevindingen.map((b) => `[${b.soort}] ${b.kop}`).join(' | ')}`);
  console.log(`geschreven   : ${uit} (${fs.statSync(uit).size} bytes, ${aan.length} ontvanger(s))`);
})().catch((e) => {
  console.error(`Rapport mislukt: ${e.message}`);
  process.exit(1);
});
