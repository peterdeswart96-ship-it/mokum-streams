const { valideerCommando } = require('./commands');

// Kernlus van de agent: commando's ophalen, per commando uitvoeren via de
// OBS-pool, en de status (incl. bevestigde commando-ids) terugsturen.
// `pool` en `backend` worden geïnjecteerd zodat runOnce testbaar is met fakes.

async function voerCommandoUit(pool, cmd) {
  switch (cmd.type) {
    case 'startStream':
      return pool.startStream(cmd.tableNumber);
    case 'stopStream':
      return pool.stopStream(cmd.tableNumber);
    case 'setOverlay':
      return pool.setOverlay(cmd.tableNumber, cmd.sourceName, cmd.enabled);
    default:
      throw new Error(`onbekend type ${cmd.type}`);
  }
}

async function runOnce(config, pool, backend, logger = console) {
  const commands = await backend.fetchCommands(config);

  const verwerkteCommandoIds = [];
  for (const cmd of commands) {
    try {
      valideerCommando(cmd);
      await voerCommandoUit(pool, cmd);
      verwerkteCommandoIds.push(cmd.id);
      logger.log(`[OK] ${cmd.type} tafel ${cmd.tableNumber}`);
    } catch (e) {
      logger.log(`[FOUT] commando ${cmd && cmd.id}: ${e.message}`);
    }
  }

  const tables = [];
  for (const t of config.tables) {
    try {
      tables.push({ tableNumber: t.tableNumber, ...(await pool.status(t.tableNumber)) });
    } catch (e) {
      tables.push({ tableNumber: t.tableNumber, obsConnected: false, streaming: false, bitrateKbps: 0 });
    }
  }

  await backend.postStatus(config, {
    agentTime: new Date().toISOString(),
    verwerkteCommandoIds,
    tables,
  });
}

function startLoop(config, pool, backend, logger = console) {
  const tick = async () => {
    try {
      await runOnce(config, pool, backend, logger);
    } catch (e) {
      logger.log(`[LOOP] ${e.message}`);
    }
  };
  tick();
  return setInterval(tick, config.pollIntervalMs);
}

module.exports = { voerCommandoUit, runOnce, startLoop };
