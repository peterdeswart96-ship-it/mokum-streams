const { app } = require('@azure/functions');
const { isAdmin } = require('../admin/auth');
const { getWedstrijdenBijMokum } = require('../mokumCompetitie');

// GET /api/manage/competitie/wedstrijden — voedt de competitie-wizard (#120). Aankomende
// teamwedstrijden die bij Mokum gespeeld worden, uit het mokum-competitie-project.
// Admin-beveiligd: het is een beheerscherm, geen publieke data. Read-only.
// Zie api-contract v0.58.

const json = (status, body) => ({ status, jsonBody: body });

app.http('adminCompetitieWedstrijden', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/competitie/wedstrijden',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    try {
      const resultaat = await getWedstrijdenBijMokum();
      if (resultaat.mislukt.length) {
        context.warn(`[competitie] wedstrijden ophalen mislukt voor: ${resultaat.mislukt.join(', ')}`);
      }
      return json(200, resultaat);
    } catch (e) {
      context.warn(`[FOUT] [competitie] mokum-competitie onbereikbaar: ${e.message}`);
      return json(502, { error: `mokum-competitie: ${e.message}` });
    }
  },
});
