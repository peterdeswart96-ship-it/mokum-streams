const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { getUpcomingTournaments } = require('../cuescore');
const { mergePlanning, STANDAARD_DEFAULTS } = require('../planning/planning');
const { buildSchedule } = require('../public/live');
const { isAdmin } = require('../admin/auth');

// Timer-Function: importeert de geplande Mokum-toernooien uit Cuescore en werkt
// planning.json bij. Nieuwe toernooien krijgen de standaard-instellingen; bestaande
// records behouden hun handmatige keuzes (zie planning.js / api-contract v0.4).
// Draait elk uur (toernooien zijn er pas na 18:00, dus uurlijks is ruim genoeg).
// Dezelfde `verwerk` wordt hergebruikt door de handmatige refresh-endpoint (v0.19).

const CRON_ELK_UUR = '0 0 * * * *';

// Draait de import één keer. Geeft een resultaat-object terug zodat zowel de timer
// als het HTTP-endpoint de uitkomst (of de fout) kunnen rapporteren.
async function verwerk(now, context) {
  const defaults = (await readJson('config/defaults.json', STANDAARD_DEFAULTS)) || STANDAARD_DEFAULTS;
  const bestaand = (await readJson('planning.json', [])) || [];

  let imported;
  try {
    imported = await getUpcomingTournaments({ now, days: 14 });
  } catch (e) {
    context.log(`[FOUT] Cuescore-import mislukt, planning ongewijzigd: ${e.message}`);
    return { ok: false, error: e.message };
  }

  const samengevoegd = mergePlanning(bestaand, imported, defaults);
  await writeJson('planning.json', samengevoegd);
  context.log(`[OK] Planning bijgewerkt: ${imported.length} geïmporteerd, ${samengevoegd.length} records totaal.`);
  return { ok: true, imported: imported.length, total: samengevoegd.length };
}

app.timer('importPlanning', {
  schedule: CRON_ELK_UUR,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

// POST /api/manage/planning/refresh — draait de Cuescore-import nu meteen (i.p.v.
// wachten op de uurlijkse timer) en geeft de bijgewerkte agenda terug. Handig om te
// forceren én om te zien of Azure Cuescore kan bereiken. Zie api-contract v0.19.
app.http('refreshPlanning', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/planning/refresh',
  handler: async (request, context) => {
    if (!isAdmin(request)) return { status: 401, jsonBody: { error: 'niet geautoriseerd' } };
    const now = new Date();
    const res = await verwerk(now, context);
    if (!res.ok) return { status: 502, jsonBody: { error: `Cuescore-import mislukt: ${res.error}` } };
    const planning = (await readJson('planning.json', [])) || [];
    const items = buildSchedule(planning, now, 7);
    return { status: 200, jsonBody: { imported: res.imported, total: res.total, items } };
  },
});

module.exports = { verwerk };
