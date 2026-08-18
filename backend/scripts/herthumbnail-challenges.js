#!/usr/bin/env node
// Vervangt de thumbnail (én beschrijving, zie hieronder) van bestaande OPENBARE
// challenge-video's door het huidige challenge-match.html-ontwerp (twee botsende
// pool-ballen, AI-stijl) — voor challenges die zijn afgerond vóórdat dat ontwerp er kwam
// (2026-07-27, "nieuwe AI-thumbnailstijl live in de pipeline"). Die video's hebben nog het
// oudere canvas-ontwerp.
//
// LET OP — anders dan herthumbnail-batch.js: /api/manage/finalize met type:'challenge'
// herschrijft ook de VIDEOBESCHRIJVING (niet alleen de thumbnail), want dat is hoe
// finaliseerChallenge() werkt. Voor deze oude video's bevat de beschrijving vermoedelijk
// toch al hetzelfde vaste sjabloon, maar controleer dat bij twijfel eerst met een dry-run.
//
// De spelersnamen komen NIET uit Cuescore (dat is voor een losse challenge sowieso niet
// gekoppeld) maar worden uit de video-TITEL gehaald, met wat voorzichtige opschoning
// (voorvoegsels als "Tafel N", "MOKUM CHALLENGE MATCH:" eraf). Geen woorden herschikken of
// tekst na een "|" wegknippen — bij te veel titelvarianten is dat vaker fout dan goed; beter
// een iets rommeliger thumbnail dan de verkeerde namen.
//
// Nodig: env ADMIN_TOKEN.
// Draaien (dry-run — toont per video de tekst die op de thumbnail komt):
//   node backend/scripts/herthumbnail-challenges.js
// Écht uitvoeren:
//   node backend/scripts/herthumbnail-challenges.js --doen
// Eén of meer specifieke video's, los van de datumgrens:
//   node backend/scripts/herthumbnail-challenges.js --video xxxxx,yyyyy --doen

const fs = require('fs');
const path = require('path');

const API = process.env.API_BASIS || 'https://mokum-streams-func.azurewebsites.net';
const TOKEN = process.env.ADMIN_TOKEN;

const args = process.argv.slice(2);
const doen = args.includes('--doen');
if (doen && !TOKEN) { console.error('ADMIN_TOKEN ontbreekt (env).'); process.exit(1); }

const videoArg = args.find((a) => a.startsWith('--video'));
const videoIdx = args.indexOf(videoArg);
const videoFilter = videoArg
  ? (videoArg.includes('=') ? videoArg.split('=')[1] : args[videoIdx + 1]).split(',').map((s) => s.trim())
  : null;

// challenge-match.html kreeg dit ontwerp op 2026-07-27 — challenges van vóór die datum
// hebben nog het oude canvas-ontwerp.
const TEMPLATE_SINDS = '2026-07-27';

// Voorzichtige opschoning: alleen bekende, vaste voorvoegsels/staarten eraf. Geen
// woordvolgorde aanpassen — dat gaat bij een titel als "9 Ball - Race to 100 | Max Anholt
// vs Sem van den Berg" (namen NA het scheidingsteken) juist fout.
function schoonSpelersTekst(titel) {
  let t = String(titel || '').trim();
  t = t.replace(/^tafel\s*\d+\s*/i, '');
  t = t.replace(/^mokum\s+challenge\s+match:?\s*/i, '');
  t = t.replace(/^challenge\s*match\s*@?mokum:?\s*/i, '');
  t = t.replace(/^challenge\s*match:?\s*/i, '');
  t = t.replace(/^challengematch:?\s*/i, '');
  t = t.replace(/\s*\([^)]*\)\s*$/, ''); // trailing "(Race to 100)"/"(Xmas shootout)" eraf
  t = t.replace(/\s+challenge\s+match$/i, '');
  t = t.replace(/\s+challenge$/i, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

const wachten = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let kandidaten;

  if (videoFilter) {
    kandidaten = [];
    for (const videoId of videoFilter) {
      const r = await fetch(`${API}/api/manage/video?videoId=${encodeURIComponent(videoId)}`, {
        headers: { Authorization: `Bearer ${TOKEN || ''}` },
      });
      if (!r.ok) { console.error(`  ${videoId}: video niet gevonden (HTTP ${r.status})`); continue; }
      const v = await r.json();
      const datum = (v.actualStartTime || '').slice(0, 10) || null;
      kandidaten.push({ datum, naam: v.title, videoId, spelersTekst: schoonSpelersTekst(v.title) });
    }
  } else {
    const res = await fetch(`${API}/api/manage/inventory`, { headers: { Authorization: `Bearer ${TOKEN || ''}` } });
    if (!res.ok) {
      console.error(`inventory faalde: HTTP ${res.status} — heb je ADMIN_TOKEN gezet?`);
      process.exitCode = 1;
      return;
    }
    const inv = await res.json();

    kandidaten = inv.rows
      .filter((r) => r.zichtbaarheid === 'public' && r.categorie === 'challenge' && r.datum && r.datum < TEMPLATE_SINDS)
      .map((r) => ({ datum: r.datum, naam: r.naam, videoId: r.videoId, spelersTekst: schoonSpelersTekst(r.naam) }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
  }

  if (!kandidaten.length) {
    console.log('Geen kandidaten voor deze selectie.');
    return;
  }

  console.log(`${kandidaten.length} challenge-video('s) geselecteerd${doen ? '' : ' (DRY-RUN — voeg --doen toe om echt uit te voeren)'}:\n`);
  console.log('LET OP: dit herschrijft ook de videobeschrijving, niet alleen de thumbnail.\n');
  const resultaten = [];
  for (const k of kandidaten) {
    process.stdout.write(`  ${k.datum}  ${k.videoId}  "${k.naam.slice(0, 45)}" -> thumbnail-tekst: "${k.spelersTekst}" ... `);
    if (!doen) { console.log('(overgeslagen — dry-run)'); continue; }
    try {
      const r = await fetch(`${API}/api/manage/finalize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: k.videoId, type: 'challenge', spelersTekst: k.spelersTekst,
          datumISO: k.datum ? `${k.datum}T00:00:00Z` : undefined,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.ok === false) throw new Error(body.error || `HTTP ${r.status}`);
      console.log('ok');
      resultaten.push({ ...k, status: 'ok' });
    } catch (e) {
      console.log(`MISLUKT — ${e.message}`);
      resultaten.push({ ...k, status: 'mislukt', fout: e.message });
    }
    await wachten(400); // niet te snel achter elkaar tegen YouTube aan
  }
  if (doen) {
    const uitPad = path.resolve(__dirname, '..', `herthumbnail-challenges-resultaat-${Date.now()}.json`);
    fs.writeFileSync(uitPad, JSON.stringify(resultaten, null, 2), 'utf8');
    const gelukt = resultaten.filter((r) => r.status === 'ok').length;
    console.log(`\n${gelukt}/${resultaten.length} gelukt. Resultaat: ${uitPad}`);
  }
})();
