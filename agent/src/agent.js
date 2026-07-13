const { valideerCommando } = require('./commands');

// Kernlus van de agent: commando's ophalen, per commando uitvoeren via de
// OBS-pool, en de status (incl. bevestigde commando-ids) terugsturen.
// `pool` en `backend` worden geïnjecteerd zodat runOnce testbaar is met fakes.

// Standaard overlaybronnen (spiegelt backend OVERLAY_BRON). Per install te
// overrijden via config.overlaySources. Gebruikt om de werkelijke overlay-stand
// per tafel uit te lezen (dashboard-weergave, api-contract v0.10).
const DEFAULT_OVERLAY_SOURCES = {
  sponsors: 'Sponsor slideshow',
  scoreboard: 'Scoreboard',
  cuescoreLogo: 'Cuescore logo',
  jumbotron: 'Jumbotron',
  pauzemelding: 'Pauzemelding',
};

// Is een periodieke ("rotatie") overlay nu zichtbaar? true gedurende de eerste
// `forSec` seconden van elke `everySec`-cyclus op de wandklok. Bijv. everySec=180,
// forSec=20 → elke 3 minuten 20 seconden aan. Pure functie → testbaar.
function rotatieZichtbaar(rotation, nowMs) {
  const everySec = Number(rotation && rotation.everySec) || 0;
  const forSec = Number(rotation && rotation.forSec) || 0;
  if (everySec <= 0 || forSec <= 0) return false;
  return Math.floor(nowMs / 1000) % everySec < forSec;
}

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

async function runOnce(config, pool, backend, logger = console, nowMs = Date.now()) {
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
      // Permanente fout (bron bestaat niet) → bevestigen/droppen, anders blijft één rare
      // toggle de agent eeuwig in een lus houden. Transiënt (OBS onbereikbaar) → NIET
      // bevestigen; volgende tik opnieuw.
      if (e && e.code === 'SOURCE_NOT_FOUND') {
        verwerkteCommandoIds.push(cmd.id);
        logger.log(`[DROP] ${cmd.type} tafel ${cmd.tableNumber}: ${e.message}`);
      } else {
        logger.log(`[FOUT] commando ${cmd && cmd.id}: ${e.message}`);
      }
    }
  }

  const overlaySources = config.overlaySources || DEFAULT_OVERLAY_SOURCES;
  const rotations = config.rotations || [];
  const tables = [];
  for (const t of config.tables) {
    try {
      const base = await pool.status(t.tableNumber);
      // Overlay-standen alleen uitlezen als er gezonden wordt (anders irrelevant + extra calls).
      let overlays;
      if (base.streaming && typeof pool.overlayStates === 'function') {
        try {
          overlays = await pool.overlayStates(t.tableNumber, overlaySources);
        } catch (e) {
          logger.log(`[STATUS] overlay-standen tafel ${t.tableNumber} mislukt: ${e.message}`);
        }
      }
      // Periodieke overlays (rotatie): edge-triggered aan/uit zetten o.b.v. de wandklok.
      // Hergebruikt de zojuist gelezen overlay-standen zodat we alleen bij een wijziging
      // een OBS-call doen. Alleen zinvol als er gezonden wordt.
      if (base.streaming && overlays && rotations.length) {
        for (const r of rotations) {
          const bron = overlaySources[r.key];
          if (!bron) continue;
          const gewenst = rotatieZichtbaar(r, nowMs);
          if (overlays[r.key] !== gewenst) {
            try {
              await pool.setOverlay(t.tableNumber, bron, gewenst);
              overlays[r.key] = gewenst; // gerapporteerde stand meteen bijwerken
              logger.log(`[ROTATIE] tafel ${t.tableNumber} ${bron} -> ${gewenst ? 'aan' : 'uit'}`);
            } catch (e) {
              logger.log(`[ROTATIE] ${bron} tafel ${t.tableNumber} mislukt: ${e.message}`);
            }
          }
        }
      }
      tables.push({ tableNumber: t.tableNumber, ...base, ...(overlays ? { overlays } : {}) });
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

module.exports = { voerCommandoUit, runOnce, startLoop, rotatieZichtbaar };
