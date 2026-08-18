#!/usr/bin/env node
// Vervangt de thumbnail van bestaande OPENBARE video's door het (nieuwere) template-ontwerp
// dat nu bij hun titel hoort — voor reeksen die pas ná het finaliseren van die video's een
// eigen ontwerp kregen (#95: 8-ball-ranking, 9-ball-sunday, king-of-the-table,
// doubles-tournament, allemaal toegevoegd op 2026-08-16). Video's van vóór die datum hebben
// dus nog de oude/generieke thumbnail, ook al matcht hun titel inmiddels een eigen template.
//
// Gebruikt dezelfde /api/manage/finalize-route als de handmatige "alleen thumbnail"-actie —
// dus met backup (idempotent, overschrijft de allereerste backup niet) en /undo blijft werken.
//
// Nodig: env ADMIN_TOKEN.
// Draaien (dry-run, toont alleen wat er zou gebeuren):
//   node backend/scripts/herthumbnail-batch.js --reeks king-of-the-table,doubles-tournament
// Écht uitvoeren:
//   node backend/scripts/herthumbnail-batch.js --reeks king-of-the-table,doubles-tournament --doen

const fs = require('fs');
const path = require('path');
const { templateVoorToernooi } = require('../src/video/detectie');

const API = process.env.API_BASIS || 'https://mokum-streams-func.azurewebsites.net';
const TOKEN = process.env.ADMIN_TOKEN;

const args = process.argv.slice(2);
const doen = args.includes('--doen');
if (doen && !TOKEN) { console.error('ADMIN_TOKEN ontbreekt (env).'); process.exit(1); }

const reeksArg = args.find((a) => a.startsWith('--reeks'));
const reeksIdx = args.indexOf(reeksArg);
const reeksFilter = reeksArg
  ? (reeksArg.includes('=') ? reeksArg.split('=')[1] : args[reeksIdx + 1]).split(',').map((s) => s.trim())
  : null;

// Reeksen die op 2026-08-16 hun eigen template kregen — vóór die datum gefinaliseerd = oud ontwerp.
const NIEUWE_TEMPLATES = new Set(['8-ball-ranking', '9-ball-sunday', 'king-of-the-table', 'doubles-tournament']);
const TEMPLATE_SINDS = '2026-08-16';

const wachten = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const res = await fetch(`${API}/api/manage/inventory`, { headers: { Authorization: `Bearer ${TOKEN || ''}` } });
  if (!res.ok) { console.error(`inventory faalde: HTTP ${res.status} — heb je ADMIN_TOKEN gezet?`); process.exit(1); }
  const inv = await res.json();

  const kandidaten = inv.rows
    .filter((r) => r.zichtbaarheid === 'public' && r.datum && r.datum < TEMPLATE_SINDS)
    .map((r) => ({ key: templateVoorToernooi(r.naam), datum: r.datum, naam: r.naam, videoId: r.videoId }))
    .filter((r) => NIEUWE_TEMPLATES.has(r.key))
    .filter((r) => !reeksFilter || reeksFilter.includes(r.key))
    .sort((a, b) => a.key.localeCompare(b.key) || a.datum.localeCompare(b.datum));

  if (!kandidaten.length) {
    console.log('Geen kandidaten voor deze selectie.');
    process.exit(0);
  }

  console.log(`${kandidaten.length} video('s) geselecteerd${doen ? '' : ' (DRY-RUN — voeg --doen toe om echt uit te voeren)'}:\n`);
  const resultaten = [];
  for (const k of kandidaten) {
    process.stdout.write(`  ${k.key.padEnd(20)} ${k.datum}  ${k.videoId}  ${k.naam.slice(0, 60)} ... `);
    if (!doen) { console.log('(overgeslagen — dry-run)'); continue; }
    try {
      const r = await fetch(`${API}/api/manage/finalize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: k.videoId, tournamentName: k.naam, datumISO: `${k.datum}T00:00:00Z` }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.ok === false) throw new Error(body.error || `HTTP ${r.status}`);
      console.log(`ok (${body.template})`);
      resultaten.push({ ...k, status: 'ok', template: body.template });
    } catch (e) {
      console.log(`MISLUKT — ${e.message}`);
      resultaten.push({ ...k, status: 'mislukt', fout: e.message });
    }
    await wachten(400); // niet te snel achter elkaar tegen YouTube aan
  }
  if (doen) {
    const uitPad = path.resolve(__dirname, '..', `herthumbnail-resultaat-${Date.now()}.json`);
    fs.writeFileSync(uitPad, JSON.stringify(resultaten, null, 2), 'utf8');
    const gelukt = resultaten.filter((r) => r.status === 'ok').length;
    console.log(`\n${gelukt}/${resultaten.length} gelukt. Resultaat: ${uitPad}`);
  }
})();
