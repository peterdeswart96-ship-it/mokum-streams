const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { verwijderVerwerkt } = require('../agent/commandStore');
const { isAgent } = require('../admin/auth');
const { statusOmslagen, omslagRegel } = require('../agent/statusOmslag');

// Agent-endpoints (zie api-contract v0.5). De agent maakt alleen uitgaande HTTPS:
// hij pollt commando's (commands.json) en post status (status.json). Auth: Bearer
// AGENT_TOKEN.

const json = (status, body) => ({ status, jsonBody: body });

// GET /api/agent/commands — openstaande commando's
app.http('agentCommands', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agent/commands',
  handler: async (request) => {
    if (!isAgent(request)) return json(401, { error: 'niet geautoriseerd' });
    // Hartslag: de agent pollt dit elke ~3s → we onthouden het laatste contact zodat
    // het dashboard "agent online/offline" kan tonen. Geen agent-wijziging nodig.
    await writeJson('agent/heartbeat.json', { lastSeen: new Date().toISOString() });
    const commands = (await readJson('commands.json', [])) || [];
    return json(200, { commands });
  },
});

// POST /api/agent/status — verwerkte commando's bevestigen + status opslaan
app.http('agentStatus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'agent/status',
  handler: async (request, context) => {
    if (!isAgent(request)) return json(401, { error: 'niet geautoriseerd' });
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'ongeldige JSON' });
    }

    // Bevestigde commando's uit de wachtrij halen (idempotent). ALLEEN schrijven als er iets te
    // bevestigen valt: de agent post om de paar seconden, en elke onnodige schrijfactie was een
    // kans om een net door een timer klaargezet commando te overschrijven (07-10). Het schrijven
    // zelf loopt met botsingsbeveiliging (ETag), zie agent/commandStore.js.
    const verwerkt = Array.isArray(body.verwerkteCommandoIds) ? body.verwerkteCommandoIds.filter(Boolean) : [];
    const rest = verwerkt.length
      ? await verwijderVerwerkt(verwerkt)
      : ((await readJson('commands.json', [])) || []);

    // Omslagen (gaat zenden / gestopt) loggen vóór we de vorige status overschrijven (#116).
    // Op Warning-niveau, want logLevel.default staat op Warning (zie #112): een gewone .log()
    // haalt Application Insights niet. Het loggen mag de statuspost nooit laten mislukken —
    // een agent die geen status kwijt kan, ziet er voor het dashboard offline uit.
    try {
      const vorige = await readJson('status.json', null);
      for (const o of statusOmslagen(vorige && vorige.tables, body.tables)) context.warn(omslagRegel(o));
    } catch (e) {
      context.warn(`[agent] statusomslag loggen mislukt: ${e.message}`);
    }

    // Laatst gerapporteerde status bewaren (bron voor dashboard/live).
    await writeJson('status.json', { agentTime: body.agentTime || null, tables: body.tables || [] });

    return json(200, { ok: true, resterend: rest.length });
  },
});
