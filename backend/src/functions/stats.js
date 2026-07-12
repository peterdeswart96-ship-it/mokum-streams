const { app } = require('@azure/functions');
const { readJson, updateJson } = require('../storage/blob');
const { isAdmin } = require('../admin/auth');
const { registreerHit, schoonPerDag } = require('../stats/hits');

// Cookieloze bezoek-/QR-teller (#18 fase 1). /api/hit telt een paginaweergave (met
// bron uit utm_source) — publiek, fire-and-forget (past bij navigator.sendBeacon).
// /api/manage/stats geeft de opgetelde cijfers terug (beheer). Zie docs/api-contract.md.

const STATS_PAD = 'stats/hits.json';
const json = (status, body) => ({ status, jsonBody: body });

// POST/GET /api/hit?source=qr&page=mokumlive — publiek, geen body nodig.
app.http('hit', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  route: 'hit',
  handler: async (request) => {
    const source = request.query.get('source');
    const page = request.query.get('page');
    const now = new Date();
    const dagKey = now.toISOString().slice(0, 10);
    try {
      await updateJson(
        STATS_PAD,
        (huidig) => schoonPerDag(registreerHit(huidig, { source, page, dagKey, now: now.toISOString() })),
        null
      );
    } catch {
      // De teller mag nóóit de bezoeker beïnvloeden → fout stil inslikken.
    }
    // 204 zonder body: werkt met sendBeacon en fetch mode:'no-cors'.
    return { status: 204 };
  },
});

// GET /api/manage/stats — beheer: de opgetelde teller teruggeven (voor het dashboard
// en later het centrale mokum-bot-dashboard, #18 fase 4).
app.http('manageStats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/stats',
  handler: async (request) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const stats = (await readJson(STATS_PAD, null)) || { totaal: 0, perBron: {}, perPagina: {}, perDag: {} };
    return json(200, stats);
  },
});

module.exports = {};
