const fs = require('fs');

// Agentconfiguratie: welke tafels, welke OBS-instantie (host/poort/wachtwoord) per
// tafel, en waar de backend staat. Secrets (OBS-wachtwoorden, agent-token) horen
// bij voorkeur uit env-vars te komen, niet uit een gecommit bestand.
//
// - normalizeConfig(raw): puur (valideert + vult defaults) → unit-testbaar.
// - loadConfig(path): leest agent-config.json van schijf en normaliseert.

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('config ontbreekt');
  if (!raw.backendUrl) throw new Error('backendUrl ontbreekt in config');

  const tables = Array.isArray(raw.tables) ? raw.tables : [];
  if (tables.length === 0) throw new Error('minstens één tafel in config vereist');

  const genormaliseerd = tables.map((t) => {
    if (!Number.isInteger(t.tableNumber)) throw new Error('tafel zonder geldig tableNumber');
    const obs = t.obs || {};
    return {
      tableNumber: t.tableNumber,
      sceneName: t.sceneName || null, // null = huidige programmascène gebruiken
      obs: {
        host: obs.host || '127.0.0.1',
        port: obs.port || 4455,
        // Wachtwoord bij voorkeur uit env (OBS_PASSWORD_TAFEL_<nr>), anders uit config.
        password: process.env[`OBS_PASSWORD_TAFEL_${t.tableNumber}`] || obs.password || '',
      },
    };
  });

  return {
    backendUrl: raw.backendUrl.replace(/\/+$/, ''),
    agentToken: process.env.AGENT_TOKEN || raw.agentToken || '',
    pollIntervalMs: raw.pollIntervalMs || 5000,
    tables: genormaliseerd,
  };
}

function loadConfig(path = process.env.AGENT_CONFIG || './agent-config.json') {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  return normalizeConfig(raw);
}

module.exports = { normalizeConfig, loadConfig };
