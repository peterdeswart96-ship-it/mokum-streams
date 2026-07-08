// Uitgaande HTTPS-koppeling met de Azure-backend: commando's ophalen en status
// terugsturen. Auth via Bearer agent-token. Geen inkomende poorten in de zaal.

async function fetchCommands(config) {
  const res = await fetch(`${config.backendUrl}/api/agent/commands`, {
    headers: { Authorization: `Bearer ${config.agentToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`commando's ophalen gaf ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.commands) ? data.commands : [];
}

async function postStatus(config, body) {
  const res = await fetch(`${config.backendUrl}/api/agent/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.agentToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`status posten gaf ${res.status}`);
}

module.exports = { fetchCommands, postStatus };
