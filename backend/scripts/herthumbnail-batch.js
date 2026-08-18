#!/usr/bin/env node
// Vervangt de thumbnail van bestaande OPENBARE video's door het (nieuwere) template-ontwerp
// dat nu bij hun titel hoort — voor reeksen die pas ná het finaliseren van die video's een
// eigen (of vernieuwd) ontwerp kregen (#95, zie TEMPLATE_SINDS hieronder per reeks). Video's
// van vóór die datum hebben dus nog het oude ontwerp, ook al matcht hun titel het template
// inmiddels wel.
//
// Gebruikt dezelfde /api/manage/finalize-route als de handmatige "alleen thumbnail"-actie —
// dus met backup (idempotent, overschrijft de allereerste backup niet) en /undo blijft werken.
//
// Nodig: env ADMIN_TOKEN.
// Draaien (dry-run, toont alleen wat er zou gebeuren):
//   node backend/scripts/herthumbnail-batch.js --reeks king-of-the-table,doubles-tournament
// Écht uitvoeren:
//   node backend/scripts/herthumbnail-batch.js --reeks king-of-the-table,doubles-tournament --doen
//
// Eén of meer specifieke video's (bijv. links die je net kreeg), los van de reeks-datumgrens:
//   node backend/scripts/herthumbnail-batch.js --video ExiAMoestpg,e1d6x7RhWBo --doen

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

const videoArg = args.find((a) => a.startsWith('--video'));
const videoIdx = args.indexOf(videoArg);
const videoFilter = videoArg
  ? (videoArg.includes('=') ? videoArg.split('=')[1] : args[videoIdx + 1]).split(',').map((s) => s.trim())
  : null;

// Reeksen die pas ná deze datum hun (huidige) eigen template kregen — video's van vóór die
// datum hebben dus nog het oude ontwerp, ook al matcht hun titel het template inmiddels wel.
const TEMPLATE_SINDS = {
  '8-ball-ranking': '2026-08-16',
  '9-ball-sunday': '2026-08-16',
  'king-of-the-table': '2026-08-16',
  'doubles-tournament': '2026-08-16',
  'speedy-multi-ball': '2026-08-18', // nieuwe AI-achtergrond, verving het oude handgetekende ontwerp
};

const wachten = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let kandidaten;

  if (videoFilter) {
    // Losse video's op ID: titel live opzoeken, geen datumgrens of reeks-filter — Peter wijst
    // 'm zelf aan (bijv. een link die hij net kreeg), dus die keuze staat al vast.
    kandidaten = [];
    for (const videoId of videoFilter) {
      const r = await fetch(`${API}/api/manage/video?videoId=${encodeURIComponent(videoId)}`, {
        headers: { Authorization: `Bearer ${TOKEN || ''}` },
      });
      if (!r.ok) { console.error(`  ${videoId}: video niet gevonden (HTTP ${r.status})`); continue; }
      const v = await r.json();
      const key = templateVoorToernooi(v.title);
      if (!key) { console.error(`  ${videoId}: "${v.title}" matcht geen enkel template`); continue; }
      const datum = (v.actualStartTime || '').slice(0, 10) || null;
      kandidaten.push({ key, datum, naam: v.title, videoId });
    }
  } else {
    const res = await fetch(`${API}/api/manage/inventory`, { headers: { Authorization: `Bearer ${TOKEN || ''}` } });
    if (!res.ok) {
      console.error(`inventory faalde: HTTP ${res.status} — heb je ADMIN_TOKEN gezet?`);
      process.exitCode = 1;
      return; // zie toelichting bij "Geen kandidaten" hieronder — geen process.exit() na een fetch
    }
    const inv = await res.json();

    kandidaten = inv.rows
      .filter((r) => r.zichtbaarheid === 'public' && r.datum)
      .map((r) => ({ key: templateVoorToernooi(r.naam), datum: r.datum, naam: r.naam, videoId: r.videoId }))
      .filter((r) => TEMPLATE_SINDS[r.key] && r.datum < TEMPLATE_SINDS[r.key])
      .filter((r) => !reeksFilter || reeksFilter.includes(r.key))
      .sort((a, b) => a.key.localeCompare(b.key) || a.datum.localeCompare(b.datum));
  }

  if (!kandidaten.length) {
    console.log('Geen kandidaten voor deze selectie.');
    return; // GEEN process.exit() hier — crasht op Windows met een libuv-assertion
            // zolang er nog open fetch-sockets zijn (UV_HANDLE_CLOSING); gewoon laten
            // aflopen sluit ze netjes af.
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
        body: JSON.stringify({ videoId: k.videoId, tournamentName: k.naam, datumISO: k.datum ? `${k.datum}T00:00:00Z` : undefined }),
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
