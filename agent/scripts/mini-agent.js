// Compacte test-agent — bewijst de volautomatische keten:
//   backend-commandowachtrij → agent → obs-websocket → OBS → YouTube.
// Pollt GET /api/agent/commands, voert startStream/stopStream/setOverlay uit via
// obs-websocket, en bevestigt via POST /api/agent/status (haalt ze uit de wachtrij).
//
// Draai in een map met obs-websocket-js geïnstalleerd (bijv. C:\Users\poole\obs-test):
//   node mini-agent.js
// Vereist Node 18+ (global fetch). Secrets via env of prompt:
//   AGENT_TOKEN, OBS_PASSWORD_TAFEL_1  (nooit in code/chat).

const { OBSWebSocket } = require('obs-websocket-js');
const readline = require('readline');

const BACKEND = 'https://mokum-streams-func.azurewebsites.net';
const POLL_MS = 3000;
// Per tafel de obs-websocket-poort (wachtwoord komt uit env/prompt).
const TABLES = { 1: { host: '127.0.0.1', port: 4455 } };

function vraag(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

const conns = new Map();
async function obsFor(tableNumber, password) {
  if (conns.has(tableNumber)) return conns.get(tableNumber);
  const cfg = TABLES[tableNumber];
  if (!cfg) throw new Error(`onbekende tafel ${tableNumber}`);
  const obs = new OBSWebSocket();
  await obs.connect(`ws://${cfg.host}:${cfg.port}`, password || undefined);
  obs.on('ConnectionClosed', () => conns.delete(tableNumber));
  conns.set(tableNumber, obs);
  return obs;
}

// Zoekt een overlay-bron in de huidige scène; valt terug op groepen als 'ie genest is.
async function vindSceneItem(obs, sourceName) {
  const { currentProgramSceneName: scene } = await obs.call('GetCurrentProgramScene');
  try {
    const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName: scene, sourceName });
    return { sceneName: scene, sceneItemId };
  } catch (_) {
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: scene });
    for (const item of sceneItems) {
      if (item.isGroup) {
        const { sceneItems: g } = await obs.call('GetGroupSceneItemList', { sceneName: item.sourceName });
        const t = g.find((x) => x.sourceName === sourceName);
        if (t) return { sceneName: item.sourceName, sceneItemId: t.sceneItemId };
      }
    }
    throw new Error(`bron '${sourceName}' niet gevonden`);
  }
}

async function api(path, method, token, body) {
  const res = await fetch(BACKEND + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

async function execute(cmd, password) {
  const obs = await obsFor(cmd.tableNumber, password);
  // start/stop idempotent: al-gestart/al-gestopt is géén fout (commando is dan "klaar").
  if (cmd.type === 'startStream') {
    try { await obs.call('StartStream'); return 'OBS gestart'; } catch { return 'OBS was al gestart'; }
  }
  if (cmd.type === 'stopStream') {
    try { await obs.call('StopStream'); return 'OBS gestopt'; } catch { return 'OBS was al gestopt'; }
  }
  if (cmd.type === 'setOverlay') {
    const { sceneName, sceneItemId } = await vindSceneItem(obs, cmd.sourceName);
    await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: cmd.enabled });
    return `overlay '${cmd.sourceName}' -> ${cmd.enabled ? 'aan' : 'uit'}`;
  }
  return `onbekend type ${cmd.type}`;
}

async function main() {
  const token = process.env.AGENT_TOKEN || (await vraag('AGENT_TOKEN: ')).trim();
  const password = process.env.OBS_PASSWORD_TAFEL_1 || (await vraag('OBS-websocket wachtwoord Tafel 1: ')).trim();

  // Oude commando's leegmaken (niet uitvoeren) → schone start.
  const { commands: stale } = await api('/api/agent/commands', 'GET', token);
  if (stale.length) {
    await api('/api/agent/status', 'POST', token, {
      agentTime: new Date().toISOString(), verwerkteCommandoIds: stale.map((c) => c.id), tables: [],
    });
    console.log(`[start] ${stale.length} oude commando's geleegd (niet uitgevoerd).`);
  }
  console.log(`[start] mini-agent draait; pollt elke ${POLL_MS / 1000}s -> ${BACKEND}`);

  for (;;) {
    try {
      const { commands } = await api('/api/agent/commands', 'GET', token);
      const done = [];
      for (const cmd of commands) {
        if (!TABLES[cmd.tableNumber]) {
          console.log(`[cmd] tafel ${cmd.tableNumber} overgeslagen (niet beheerd door deze agent)`);
          done.push(cmd.id); // bevestigen → niet eeuwig herproberen
          continue;
        }
        try {
          const res = await execute(cmd, password);
          console.log(`[cmd] tafel ${cmd.tableNumber} ${cmd.type} -> ${res}`);
          done.push(cmd.id);
        } catch (e) {
          console.error(`[cmd] FOUT ${cmd.type} tafel ${cmd.tableNumber}: ${e.message || e}`);
        }
      }
      if (done.length) {
        await api('/api/agent/status', 'POST', token, {
          agentTime: new Date().toISOString(), verwerkteCommandoIds: done, tables: [],
        });
      }
    } catch (e) {
      console.error(`[poll] ${e.message || e}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => { console.error('FATAL:', e.message || e); process.exit(1); });
