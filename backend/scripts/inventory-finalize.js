#!/usr/bin/env node
// Idempotente bulk-finalize voor het kanaal (#66): zet ontbrekende thumbnails + hoofdstukken
// op de toernooi-video's. Herhaalbaar — leest de actuele stand via /api/manage/inventory en
// doet alleen wat nog niet gebeurd is. Quota- en rate-limit-bewust: stopt netjes.
//
// Nodig: env ADMIN_TOKEN (Bearer voor de admin-endpoints). Optioneel: MAX_OPS (default 120)
// om per run te begrenzen; de rest pakt de volgende run.
//
// Aanpak:
//  - Hoofdstukken: match op TYPE + #NUMMER (geverifieerd) → tournamentId; tafel uit de titel,
//    of tafel 3 voor oude streams zonder "Tafel N" (was vroeger altijd tafel 3). alleenHoofdstukken
//    (geen thumbnail → geen thumbnail-rate-limit).
//  - Thumbnails: op-naam (per toernooisoort), voor video's zonder onze thumbnail.

const API = 'https://mokum-streams-func.azurewebsites.net';
const TOKEN = process.env.ADMIN_TOKEN;
const MAX_OPS = Number(process.env.MAX_OPS) || 120;
const { templateVoorToernooi } = require('../src/video/detectie');

if (!TOKEN) { console.error('ADMIN_TOKEN ontbreekt (env).'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => { const m = /#\s*(\d+)/.exec(s || ''); return m ? m[1] : null; };
const dec = (e) => { let s = e.replace(/\+/g, ' '); try { s = decodeURIComponent(s); } catch {} try { s = decodeURIComponent(s); } catch {} return s.replace(/\s{2,}/g, ' ').trim(); };
const MAAND = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
const iso = (t) => { const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(t || ''); if (!m) return null; const mm = MAAND[m[1].toLowerCase()]; return mm ? `${m[3]}-${String(mm).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}` : null; };

async function post(body) {
  const r = await fetch(`${API}/api/manage/finalize`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok, status: r.status, j };
}

async function scrapeTournaments() {
  const re = /class="date[^"]*">\s*([^<]+?)\s*<\/div>\s*<div class="name">\s*<a[^>]*href="[^"]*\/tournament\/([^"\/]+)\/(\d+)"/g;
  const map = new Map();
  for (let p = 1; p <= 20; p++) {
    const html = await (await fetch(`https://cuescore.com/mokumpooldarts/tournaments?date=2025-01-01&sort=asc&page=${p}`, { signal: AbortSignal.timeout(30000) })).text();
    let n = 0;
    for (const m of html.matchAll(re)) { if (!map.has(m[3])) { map.set(m[3], { id: m[3], name: dec(m[2]), datum: iso(m[1]) }); n++; } }
    if (!n) break; await sleep(250);
  }
  return [...map.values()];
}

(async () => {
  const inv = await (await fetch(`${API}/api/manage/inventory`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const toern = await scrapeTournaments();
  const byType = new Map();
  for (const t of toern) { const ty = templateVoorToernooi(t.name); if (!ty) continue; if (!byType.has(ty)) byType.set(ty, []); byType.get(ty).push(t); }
  const matchToern = (naam, datum) => {
    const type = templateVoorToernooi(naam); if (!type) return null; const nr = num(naam); const c = byType.get(type) || [];
    const bd = c.filter((t) => t.datum && t.datum === datum);
    if (bd.length === 1 && (!nr || !num(bd[0].name) || num(bd[0].name) === nr)) return bd[0];
    if (nr) { const bn = c.filter((t) => num(t.name) === nr); if (bn.length === 1) return bn[0]; }
    return null;
  };

  const toernooiRows = inv.rows.filter((r) => r.categorie === 'toernooi');
  let ops = 0, chOk = 0, thOk = 0, thRate = false, quota = false;

  // 1) Hoofdstukken (alleen-hoofdstukken → geen thumbnail-rate-limit).
  for (const v of toernooiRows) {
    if (ops >= MAX_OPS || quota) break;
    if (v.hoofdstukken) continue;
    const hit = matchToern(v.naam, v.datum); if (!hit) continue;
    const tafel = (v.naam.match(/tafel\s*(\d+)/i) || [])[1];
    const tableNumber = tafel ? Number(tafel) : 3; // oude streams zonder "Tafel N" = tafel 3
    const res = await post({ videoId: v.videoId, tournamentId: hit.id, tableNumber, alleenHoofdstukken: true });
    ops++;
    if (res.ok) { chOk++; console.log(`HFD  ${res.j.aantalHoofdstukken}x t${tableNumber} ${v.videoId} ${v.naam.slice(0,40)}`); }
    else { console.log(`HFD-FOUT ${v.videoId} ${res.status} ${JSON.stringify(res.j).slice(0,70)}`); if (/quota/i.test(JSON.stringify(res.j))) quota = true; }
    await sleep(350);
  }

  // 2) Thumbnails (op-naam). Stop bij de thumbnail-rate-limit; quota blijft gerespecteerd.
  for (const v of toernooiRows) {
    if (ops >= MAX_OPS || quota || thRate) break;
    if (v.thumbnail) continue;
    if (!templateVoorToernooi(v.naam)) continue;
    const res = await post({ videoId: v.videoId, tournamentName: v.naam });
    ops++;
    if (res.ok) { thOk++; console.log(`THUMB [${res.j.template}] ${v.videoId} ${v.naam.slice(0,40)}`); }
    else { const m = JSON.stringify(res.j); console.log(`THUMB-FOUT ${v.videoId} ${res.status} ${m.slice(0,70)}`); if (/too many thumbnails/i.test(m)) thRate = true; if (/quota/i.test(m)) quota = true; }
    await sleep(500);
  }

  console.log(`\nklaar: ${chOk} hoofdstukken, ${thOk} thumbnails (ops=${ops}${quota ? ', QUOTA bereikt' : ''}${thRate ? ', thumbnail-rate-limit bereikt' : ''})`);
})().catch((e) => { console.error('FOUT', e.message); process.exit(1); });
