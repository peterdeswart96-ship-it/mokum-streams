const { app } = require('@azure/functions');
const { isAdmin } = require('../admin/auth');
const { readJson, writeJson } = require('../storage/blob');
const { normaliseerTicker, tickerVoorUitzending } = require('../public/ticker');

// Beheer van de tickerregels onderin het pauzescherm (#65). Admin-beveiligd.
//
//  GET  /api/manage/ticker  → { regels, actief }
//                             regels = wat er is ingesteld (kan leeg zijn)
//                             actief = wat de overlay nu toont (incl. standaardregel)
//  POST /api/manage/ticker  → body { regels: string[] } of { regels: "regel\nregel" }
//
// De overlay leest de regels via GET /api/live (veld `ticker`), dus een wijziging is
// binnen één pollronde (~15s) in beeld — zonder OBS aan te raken.

const PAD = 'ticker.json';
const json = (status, body) => ({ status, jsonBody: body });

app.http('adminTickerGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/ticker',
  handler: async (request) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const regels = (await readJson(PAD, [])) || [];
    return json(200, { regels: normaliseerTicker(regels), actief: tickerVoorUitzending(regels) });
  },
});

app.http('adminTickerSet', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/ticker',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'ongeldige of lege JSON' }); }
    if (!body || body.regels === undefined) return json(400, { error: 'regels ontbreekt' });

    const regels = normaliseerTicker(body.regels);
    await writeJson(PAD, regels);
    context.log(`[ticker] bijgewerkt: ${regels.length} regel(s).`);
    return json(200, { ok: true, regels, actief: tickerVoorUitzending(regels) });
  },
});
