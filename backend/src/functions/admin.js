const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { STANDAARD_DEFAULTS, planningStatus } = require('../planning/planning');
const { updatePlanningRecord, mergeDefaults } = require('../admin/planningStore');
const { isAdmin } = require('../admin/auth');
const { zaalDelen } = require('../schedule/schedule');

// Admin-HTTP-endpoints voor het dashboard (auth vereist, zie api-contract v0.5).
// Deze functies doen alleen lezen/schrijven van de Blob-JSON; de validatie- en
// merge-logica zit in ../admin/planningStore.js (puur, getest).

const json = (status, body) => ({ status, jsonBody: body });
const unauthorized = () => json(401, { error: 'niet geautoriseerd' });

async function leesBody(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// GET /api/manage/config — tafelconfig
app.http('adminConfig', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/config',
  handler: async (request) => {
    if (!isAdmin(request)) return unauthorized();
    return json(200, (await readJson('config/tables.json', [])) || []);
  },
});

// GET /api/manage/planning — alle planning-records
app.http('adminPlanningList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/planning',
  handler: async (request) => {
    if (!isAdmin(request)) return unauthorized();
    const items = (await readJson('planning.json', [])) || [];
    // Verrijk met de lifecycle-status (Concept/Gepland/Live/Klaar/Geannuleerd) o.b.v. de
    // broadcast-stand van vandaag — voor de statusweergave in de Toernooi planner (#42 fase 4).
    const { datum } = zaalDelen(new Date());
    const store = (await readJson(`broadcasts/${datum}.json`, {})) || {};
    const verrijkt = items.map((r) => ({ ...r, status: planningStatus(r, store, datum) }));
    return json(200, { items: verrijkt });
  },
});

// POST /api/manage/planning/{id} — instellingen van één toernooi wijzigen
app.http('adminPlanningUpdate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/planning/{id}',
  handler: async (request) => {
    if (!isAdmin(request)) return unauthorized();
    const patch = await leesBody(request);
    if (!patch) return json(400, { error: 'ongeldige of lege JSON' });

    const planning = (await readJson('planning.json', [])) || [];
    let res;
    try {
      res = updatePlanningRecord(planning, request.params.id, patch);
    } catch (e) {
      return json(400, { error: e.message });
    }
    if (!res) return json(404, { error: 'toernooi niet gevonden' });

    await writeJson('planning.json', res.planning);
    return json(200, res.record);
  },
});

// GET /api/manage/defaults — standaard-instellingen
app.http('adminDefaultsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/defaults',
  handler: async (request) => {
    if (!isAdmin(request)) return unauthorized();
    return json(200, (await readJson('config/defaults.json', STANDAARD_DEFAULTS)) || STANDAARD_DEFAULTS);
  },
});

// POST /api/manage/defaults — standaard-instellingen wijzigen
app.http('adminDefaultsUpdate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/defaults',
  handler: async (request) => {
    if (!isAdmin(request)) return unauthorized();
    const patch = await leesBody(request);
    if (!patch) return json(400, { error: 'ongeldige of lege JSON' });

    const current = (await readJson('config/defaults.json', STANDAARD_DEFAULTS)) || STANDAARD_DEFAULTS;
    let merged;
    try {
      merged = mergeDefaults(current, patch);
    } catch (e) {
      return json(400, { error: e.message });
    }
    await writeJson('config/defaults.json', merged);
    return json(200, merged);
  },
});
