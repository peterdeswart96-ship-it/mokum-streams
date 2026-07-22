const { app } = require('@azure/functions');
const { isAdmin } = require('../admin/auth');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { isArmed } = require('../config/automation');
const { finaliseerToernooi, finaliseerChallenge, finaliseerAlleenThumbnail, herstelVideo } = require('../video/finalize');
const { getVideoDetails } = require('../youtube/videos');

// Handmatige finalize-endpoints (#56, bouwsteen 3b). Admin-beveiligd (Bearer ADMIN_TOKEN).
// Bedoeld om de keten op ÉÉN video te testen vóór we het automatisch aanzetten. Elke
// finalize maakt eerst een backup, dus /undo zet alles exact terug.
//
//  POST /api/manage/finalize        body: { videoId, tournamentId, tableNumber }        (toernooi)
//                                     of  { videoId, spelerA, spelerB, tableNumber, spelsoort, type:'challenge' }
//                                     of  { videoId, tournamentName, templateKey? }      (alleen thumbnail, geen id)
//  POST /api/manage/finalize/undo   body: { videoId }

const json = (status, body) => ({ status, jsonBody: body });

async function leesBody(request) {
  try { return await request.json(); } catch { return undefined; }
}

app.http('adminFinalize', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/finalize',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const body = (await leesBody(request)) || {};
    if (!body.videoId) return json(400, { error: 'videoId ontbreekt' });
    try {
      const heeftTid = body.tournamentId != null && body.tournamentId !== '';
      const res = body.type === 'challenge'
        ? await finaliseerChallenge(body)
        : heeftTid
          ? await finaliseerToernooi(body)
          : await finaliseerAlleenThumbnail(body); // geen id → alleen thumbnail op naam
      return json(200, { ok: true, ...res });
    } catch (e) {
      context.log(`[finalize] fout: ${e.message}`);
      return json(500, { ok: false, error: e.message });
    }
  },
});

app.http('adminFinalizeUndo', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/finalize/undo',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const body = (await leesBody(request)) || {};
    if (!body.videoId) return json(400, { error: 'videoId ontbreekt' });
    try {
      return json(200, { ok: true, ...(await herstelVideo(body.videoId)) });
    } catch (e) {
      context.log(`[finalize/undo] fout: ${e.message}`);
      return json(500, { ok: false, error: e.message });
    }
  },
});

// GET /api/manage/video?videoId=X — titel/beschrijving/starttijd opvragen (om een video
// te identificeren vóór het handmatig finaliseren).
app.http('adminVideoDetails', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/video',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const videoId = request.query.get('videoId');
    if (!videoId) return json(400, { error: 'videoId ontbreekt' });
    try {
      const v = await getVideoDetails(videoId);
      if (!v) return json(404, { error: 'video niet gevonden' });
      return json(200, { id: v.id, title: v.title, actualStartTime: v.actualStartTime, actualEndTime: v.actualEndTime, description: (v.description || '').slice(0, 200) });
    } catch (e) {
      context.log(`[video-details] fout: ${e.message}`);
      return json(500, { error: e.message });
    }
  },
});

// Timer: finaliseert automatisch beheerde streams (met tournamentId) zodra ze gestopt
// zijn — zet thumbnail + hoofdstukken. Idempotent via de `finalized`-vlag. Gated op
// AUTOMATION_ARMED (onderdeel van de scherpgezette automatisering).
app.timer('finalizeVideos', {
  schedule: '0 * * * * *', // elke minuut
  handler: async (myTimer, context) => {
    if (!isArmed()) return; // slapend tot scherpgezet
    // Beide dagen: een avondstream die ná middernacht stopt zit nog in de store van gisteren
    // → anders wordt 'ie nooit gefinaliseerd (incident 21-07, tafel 3 zonder thumbnail).
    const now = new Date();
    const datum = zaalDelen(now).datum;
    const datumGisteren = zaalDelen(new Date(now.getTime() - 24 * 3600 * 1000)).datum;
    const paden = [...new Set([`broadcasts/${datum}.json`, `broadcasts/${datumGisteren}.json`])];
    for (const pad of paden) {
      const store = (await readJson(pad, {})) || {};
      let gewijzigd = false;
      for (const key of Object.keys(store)) {
        const e = store[key];
        if (!e || !e.stopped || e.finalized || !e.videoId || e.tournamentId == null) continue;
        try {
          const res = await finaliseerToernooi({ videoId: e.videoId, tournamentId: e.tournamentId, tableNumber: e.tableNumber });
          e.finalized = true; gewijzigd = true;
          context.log(`[finalizeVideos] tafel ${e.tableNumber} gefinaliseerd (${e.videoId}) — ${res.aantalHoofdstukken} hoofdstukken`);
        } catch (err) {
          context.log(`[finalizeVideos] tafel ${e.tableNumber} nog niet gelukt (${err.message}) — volgende ronde opnieuw`);
        }
      }
      if (gewijzigd) await writeJson(pad, store);
    }
  },
});
