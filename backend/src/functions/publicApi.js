const { app } = require('@azure/functions');
const { readJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { buildLiveTables, buildSchedule } = require('../public/live');

// Publieke, alleen-lezen endpoints voor de live-pagina/widget (geen auth).

const json = (status, body) => ({ status, jsonBody: body });
const CAMERAS_DEFAULT = [1, 3, 15, 16];
const AGENT_ONLINE_MS = 20000; // agent pollt elke ~3s → >20s stil = offline

// GET /api/live — live-status per cameratafel
app.http('publicLive', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'live',
  handler: async () => {
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
    return json(200, {
      generatedAt: now.toISOString(),
      venueLive,
      venueTables,
      podium,
      agent,
      tables: buildLiveTables(cameras, store, status, liveMatches, liveVideos),
    });
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
    return json(200, { items: buildSchedule(planning, new Date(), days) });
  },
});
