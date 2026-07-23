const { app } = require('@azure/functions');
const { isAdmin } = require('../admin/auth');
const { readJson, writeJson, getContainerClient } = require('../storage/blob');
const { getTournament } = require('../cuescore');
const { wedstrijdenVoorVideo, sorteerWedstrijden, runoutsUitArchief } = require('../video/archief');

// POST /api/manage/archief/rebuild — bouwt archief.json volledig opnieuw op uit alle
// `video-index/`-records (#59/#67). Admin-beveiligd. Kost GEEN YouTube-quota: we lezen
// alleen onze eigen blobs + de Cuescore-API (per toernooi één keer, gecachet).
//
// Nodig na het aanzetten van deze functie (al gefinaliseerde video's zijn nooit langs de
// archief-stap gekomen) en als vangnet wanneer de incrementele bijwerking iets mist.

const json = (status, body) => ({ status, jsonBody: body });

app.http('adminArchiefRebuild', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/archief/rebuild',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });

    const container = await getContainerClient();
    const paden = [];
    for await (const b of container.listBlobsFlat({ prefix: 'video-index/' })) paden.push(b.name);

    const toernooiCache = new Map();
    const alle = [];
    let gelezen = 0;
    let overgeslagen = 0;

    for (const pad of paden) {
      const rec = await readJson(pad, null);
      if (!rec || !rec.videoId || rec.tournamentId == null) { overgeslagen++; continue; }
      gelezen++;
      const id = String(rec.tournamentId);
      if (!toernooiCache.has(id)) {
        try {
          toernooiCache.set(id, await getTournament(rec.tournamentId));
        } catch (e) {
          context.log(`[archief] toernooi ${id} ophalen mislukt: ${e.message}`);
          toernooiCache.set(id, null);
        }
      }
      const tournament = toernooiCache.get(id);
      if (!tournament) continue;
      alle.push(...wedstrijdenVoorVideo(rec, tournament));
    }

    const lijst = sorteerWedstrijden(alle);
    await writeJson('archief.json', lijst);
    const runouts = runoutsUitArchief(lijst).length;
    context.log(`[archief] herbouwd: ${lijst.length} wedstrijden (${runouts} run-outs) uit ${gelezen} video's.`);
    return json(200, {
      ok: true,
      wedstrijden: lijst.length,
      runouts,
      videos: gelezen,
      toernooien: toernooiCache.size,
      overgeslagen,
      spelers: [...new Set(lijst.flatMap((r) => r.spelers || []))].length,
    });
  },
});
