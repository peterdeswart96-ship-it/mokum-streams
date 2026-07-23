const { app } = require('@azure/functions');
const { readJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { buildLiveTables, buildSchedule } = require('../public/live');
const { runoutsUitArchief } = require('../video/archief');
const { tickerVoorUitzending } = require('../public/ticker');

// Publieke, alleen-lezen endpoints voor de live-pagina/widget (geen auth).

// CORS in code (niet afhankelijk van de Azure-portal-instelling, die stil kan wegvallen):
// echo de Origin terug als 'ie op de allowlist staat. Deze endpoints zijn simpele GET's,
// dus er is geen preflight (OPTIONS) nodig. De OBS-overlays draaien op pdscloud.nl.
const CORS_ALLOWLIST = new Set([
  'https://mokum-streams.pdscloud.nl',
  'http://localhost:5173',
  'http://localhost:4173',
]);
function corsHeaders(request) {
  const origin = request && request.headers && request.headers.get('origin');
  return origin && CORS_ALLOWLIST.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

const json = (status, body, request) => ({ status, jsonBody: body, headers: corsHeaders(request) });
const CAMERAS_DEFAULT = [1, 3, 15, 16];
const AGENT_ONLINE_MS = 20000; // agent pollt elke ~3s → >20s stil = offline

// GET /api/live — live-status per cameratafel
app.http('publicLive', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'live',
  handler: async (request) => {
    const now = new Date();
    const tables = (await readJson('config/tables.json', [])) || [];
    const cameras = tables.length ? tables.map((t) => Number(t.tableNumber)) : CAMERAS_DEFAULT;
    const { datum } = zaalDelen(now);
    const store = (await readJson(`broadcasts/${datum}.json`, {})) || {};
    const status = (await readJson('status.json', {})) || {};
    const liveMatches = (await readJson('live-matches.json', {})) || {};
    const liveVideos = (await readJson('live-videos.json', {})) || {};
    // venueLive = totaal aantal lopende wedstrijden in de hele zaal (alle toernooien),
    // los van welke tafels wij filmen. null als we het (nog) niet weten.
    const venueLive = Number.isFinite(liveMatches.venueLive) ? liveMatches.venueLive : null;
    // Agent-hartslag: is de OBS-pc bereikbaar? (bron: agent/heartbeat.json, gezet door GET /agent/commands)
    const hb = (await readJson('agent/heartbeat.json', {})) || {};
    const lastSeen = hb.lastSeen ? Date.parse(hb.lastSeen) : NaN;
    const agent = {
      online: !Number.isNaN(lastSeen) && now.getTime() - lastSeen < AGENT_ONLINE_MS,
      lastSeenAt: hb.lastSeen || null,
      secondsAgo: Number.isNaN(lastSeen) ? null : Math.round((now.getTime() - lastSeen) / 1000),
    };
    // venueTables = zaalbreed raster (alle tafels met een wedstrijd) voor het eigen
    // Mokum-tafelraster in het pauzescherm (#54). Leeg tot de liveMatches-timer draait.
    const venueTables = Array.isArray(liveMatches.venueTables) ? liveMatches.venueTables : [];
    // podium = medaillescherm van een net-afgerond toernooi (winnaar-moment #54), of null.
    const podium = liveMatches.podium || null;
    // ticker = de regels die onderin het pauzescherm voorbij scrollen (#65). Nooit leeg:
    // zonder ingestelde regels komt de standaardtekst terug.
    const ticker = tickerVoorUitzending(await readJson('ticker.json', []));
    return json(200, {
      generatedAt: now.toISOString(),
      venueLive,
      venueTables,
      podium,
      ticker,
      agent,
      tables: buildLiveTables(cameras, store, status, liveMatches, liveVideos),
    }, request);
  },
});

// GET /api/archief — het volledige wedstrijd-archief: elke gefilmde wedstrijd met een
// deep-link naar het moment in de video (#59/#67). De zoekmachine op de Mokum Live-pagina
// haalt dit één keer op en filtert in de browser (paar honderd kB, geen call per toetsaanslag).
// Bron: archief.json, bijgehouden door de finalize-keten, herbouwbaar via
// POST /api/manage/archief/rebuild.
app.http('publicArchief', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'archief',
  handler: async (request) => {
    const alle = (await readJson('archief.json', [])) || [];
    const gevraagd = Number(request.query.get('limit'));
    const items = Number.isFinite(gevraagd) && gevraagd > 0 ? alle.slice(0, gevraagd) : alle;
    return json(200, { generatedAt: new Date().toISOString(), aantal: alle.length, items }, request);
  },
});

// GET /api/runouts?limit=50 — alleen de run-outs (#67, fase 1): een filter op hetzelfde
// archief, één regel per speler-met-run-out.
app.http('publicRunouts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'runouts',
  handler: async (request) => {
    const gevraagd = Number(request.query.get('limit'));
    const limit = Math.min(Math.max(Number.isFinite(gevraagd) ? gevraagd : 50, 1), 500);
    const alle = runoutsUitArchief((await readJson('archief.json', [])) || []);
    return json(200, {
      generatedAt: new Date().toISOString(),
      aantal: alle.length,
      items: alle.slice(0, limit),
    }, request);
  },
});

// GET /api/schedule?days=7 — aankomende geplande streams
app.http('publicSchedule', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'schedule',
  handler: async (request) => {
    const days = Number(request.query.get('days')) || 7;
    const planning = (await readJson('planning.json', [])) || [];
    return json(200, { items: buildSchedule(planning, new Date(), days) }, request);
  },
});
