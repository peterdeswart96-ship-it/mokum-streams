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

  const beheerdeTafels = new Set((config.tables || []).map((t) => Number(t.tableNumber)));
  const verwerkteCommandoIds = [];
  for (const cmd of commands) {
    // Ongeldig commando wordt nooit geldig → bevestigen (droppen) i.p.v. eeuwig herproberen.
    try {
      valideerCommando(cmd);
    } catch (e) {
      verwerkteCommandoIds.push(cmd && cmd.id);
      logger.log(`[DROP] ongeldig commando ${cmd && cmd.id}: ${e.message}`);
      continue;
    }
    // Tafel die deze agent niet beheert → ook bevestigen (skip). Number() voorkomt dat
    // een type-mismatch (string vs number) alle commando's stil zou overslaan.
    if (!beheerdeTafels.has(Number(cmd.tableNumber))) {
      verwerkteCommandoIds.push(cmd.id);
      logger.log(`[SKIP] tafel ${cmd.tableNumber} niet in config — commando ${cmd.id} bevestigd`);
      continue;
    }
    // Uitvoeringsfout (bijv. OBS tijdelijk onbereikbaar) → NIET bevestigen; volgende tik opnieuw.
    try {
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
