const { app } = require('@azure/functions');
const { isAdmin } = require('../admin/auth');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDag } = require('../schedule/schedule');
const { isArmed } = require('../config/automation');
const { finaliseerToernooi, finaliseerChallenge, finaliseerAlleenThumbnail, herstelVideo } = require('../video/finalize');
const { finalizeVervolg } = require('../video/finalizeBeleid');
const { finaliseerActie } = require('../video/finalizeKeuze');
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
//
// Challenges (#102): geen tournamentId, dus geen hoofdstukken — maar wél een thumbnail
// + beschrijving als de wizard spelersnamen heeft opgeslagen (streamType: 'challenge').
// Erven zo gratis dezelfde retry-/opgeeflogica (#80) als toernooien, via dezelfde timer
// (geen aparte cronjob die apart kan achterlopen). Start pas zodra `stopped: true` op de
// entry staat — voor een challenge gebeurt dat via de 2-uurslimiet (#108) of het
// inactiviteits-vangnet (#100), of gewoon een handmatige stop.
app.timer('finalizeVideos', {
  // Elke 5 minuten (was elke minuut, #101). Er valt hooguit een paar keer per dag iets af
  // te ronden, maar de timer las elke minuut twee blobs — ruim 86.000 leesacties per maand
  // voor een handvol echte acties. Een thumbnail die een paar minuten later verschijnt
  // merkt niemand; de podium-grace die wél op de seconde moet kloppen zit in checkStops,
  // en die blijft op een minuut staan.
  schedule: '0 */5 * * * *',
  handler: async (myTimer, context) => {
    if (!isArmed()) return; // slapend tot scherpgezet
    // Beide dagen: een avondstream die ná middernacht stopt zit nog in de store van gisteren
    // → anders wordt 'ie nooit gefinaliseerd (incident 21-07, tafel 3 zonder thumbnail).
    const now = new Date();
    const datum = zaalDag(now);
    const datumGisteren = zaalDag(new Date(now.getTime() - 24 * 3600 * 1000));
    const paden = [...new Set([`broadcasts/${datum}.json`, `broadcasts/${datumGisteren}.json`])];
    for (const pad of paden) {
      const store = (await readJson(pad, {})) || {};
      let gewijzigd = false;
      for (const key of Object.keys(store)) {
        const e = store[key];
        // Welke actie (#102)? 'toernooi' | 'challenge' | null (nog niet klaar, of een
        // ad-hoc stream zonder genoeg gegevens — blijft dan ongewijzigd ad-hoc).
        const actie = finaliseerActie(e);
        if (!actie) continue;
        try {
          const res = actie === 'toernooi'
            ? await finaliseerToernooi({ videoId: e.videoId, tournamentId: e.tournamentId, tableNumber: e.tableNumber })
            : await finaliseerChallenge({ videoId: e.videoId, spelerA: e.spelerA, spelerB: e.spelerB, tableNumber: e.tableNumber });
          e.finalized = true; gewijzigd = true;
          const detail = res.type === 'challenge' ? 'challenge-thumbnail' : `${res.aantalHoofdstukken} hoofdstukken`;
          context.log(`[finalizeVideos] tafel ${e.tableNumber} gefinaliseerd (${e.videoId}) — ${detail}`);
        } catch (err) {
          // Teller ophogen en WEGSCHRIJVEN (#80). Stond dit niet in de opslag, dan telde
          // niets door en bleef 'ie eeuwig opnieuw proberen — 423 keer op 29-07.
          const v = finalizeVervolg(e, err.message);
          e.finalizePogingen = v.pogingen;
          e.finalizeFout = err.message;
          gewijzigd = true;
          if (v.opgegeven) {
            e.finalizeOpgegeven = true;
            const waarom = v.onherstelbaar ? 'video bestaat niet meer' : `${v.pogingen} pogingen mislukt`;
            context.log(`[WAARSCHUWING] [finalizeVideos] tafel ${e.tableNumber} (${e.videoId}) OPGEGEVEN — ${waarom}: ${err.message}. Handmatig afronden kan met POST /api/manage/finalize.`);
          } else {
            context.log(`[finalizeVideos] tafel ${e.tableNumber} poging ${v.pogingen}/${v.max} mislukt (${err.message}) — volgende ronde opnieuw`);
          }
        }
      }
      if (gewijzigd) await writeJson(pad, store);
    }
  },
});
