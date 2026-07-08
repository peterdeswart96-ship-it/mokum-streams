const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { removeProcessed } = require('../agent/commandQueue');
const { isAgent } = require('../admin/auth');

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
    const commands = (await readJson('commands.json', [])) || [];
    return json(200, { commands });
  },
});

// POST /api/agent/status — verwerkte commando's bevestigen + status opslaan
app.http('agentStatus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'agent/status',
  handler: async (request) => {
    if (!isAgent(request)) return json(401, { error: 'niet geautoriseerd' });
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'ongeldige JSON' });
    }

    // Bevestigde commando's uit de wachtrij halen (idempotent).
    const commands = (await readJson('commands.json', [])) || [];
    const rest = removeProcessed(commands, body.verwerkteCommandoIds || []);
    await writeJson('commands.json', rest);

    // Laatst gerapporteerde status bewaren (bron voor dashboard/live).
    await writeJson('status.json', { agentTime: body.agentTime || null, tables: body.tables || [] });

    return json(200, { ok: true, resterend: rest.length });
  },
});
