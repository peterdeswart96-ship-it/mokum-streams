const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { listLiveStreams, createReusableLiveStream } = require('../youtube/broadcasts');
const { planLiveStreamSeed } = require('../setup/seed');
const { isAdmin } = require('../admin/auth');

// Eenmalige setup: zorgt dat er per cameratafel een herbruikbare liveStream
// (vaste stream key) bestaat, en schrijft de tafelconfig (tableNumber + streamId)
// naar config/tables.json. Idempotent: bestaande streams worden hergebruikt (op
// titel). De stream key zelf komt hier NIET in de respons/opslag (secret) — die
// lees je één keer uit YouTube Studio om OBS mee te configureren.
//
// POST /api/manage/setup/streams   body (optioneel) { "cameras": [1,3,15,16] }

const CAMERAS = [1, 3, 15, 16];
const json = (status, body) => ({ status, jsonBody: body });

app.http('adminSetupStreams', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/setup/streams',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });

    let cameras = CAMERAS;
    try {
      const body = await request.json();
      if (body && Array.isArray(body.cameras)) cameras = body.cameras.map(Number).filter(Number.isInteger);
    } catch {
      /* geen body → standaard camera's */
    }

    let existing;
    try {
      existing = await listLiveStreams();
    } catch (e) {
      return json(502, { error: `YouTube: ${e.message}` });
    }

    const { reuse, teMaken } = planLiveStreamSeed(existing, cameras);
    const aangemaakt = [];
    for (const { tableNumber, title } of teMaken) {
      try {
        const stream = await createReusableLiveStream({ title });
        aangemaakt.push({ tableNumber, streamId: stream.id });
      } catch (e) {
        context.log(`[FOUT] liveStream tafel ${tableNumber}: ${e.message}`);
      }
    }

    const tables = [...reuse, ...aangemaakt].sort((a, b) => a.tableNumber - b.tableNumber);
    await writeJson('config/tables.json', tables);

    return json(200, { tables, hergebruikt: reuse.length, aangemaakt: aangemaakt.length });
  },
});
