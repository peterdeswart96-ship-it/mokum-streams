const { valideerCommando } = require('./commands');

// Openingstijden-throttle (20-08, #101-vervolg): buiten bedrijfstijd fors trager pollen.
// Zelfde Europe/Amsterdam-aanpak (Intl, geen ruwe Date.getDay()/getHours()) als
// backend/src/schedule/schedule.js — daar leerde #77 dat de zaal-dag over middernacht heen
// loopt en een naïeve kalenderdag-omslag het systeem laat denken dat er niets meer speelt
// terwijl een avond nog uitloopt.
//
// Anders dan de OBS-overlays (intro.html, 02-jumbotron.html) is dit venuebreed (geen
// tafel-uitzondering voor 15/16): de camera-freeze-watchdog hoort bij élke streamende tafel
// even snel te reageren, dus die uitzondering hoort in de "is er iets live"-check in
// startLoop, niet hier.
function isDrukkeTijd(nowMs = Date.now()) {
  const delenVan = (moment) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam', weekday: 'short', hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(moment);
    const get = (t) => parts.find((p) => p.type === t).value;
    return { dag: get('weekday'), minuten: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10) };
  };

  const nu = new Date(nowMs);
  const { minuten } = delenVan(nu);
  // Welke avond dit moment nog bij hoort: vóór 06:00 hoort bij de zaal-dag van gisteren
  // (zelfde grens als zaalDag() in de backend) — anders valt een uitlopende vrijdagavond om
  // 01:00 zaterdagochtend ineens onder het weekendschema i.p.v. het doordeweekse.
  const { dag } = delenVan(new Date(nowMs - 6 * 3600 * 1000));
  const weekend = dag === 'Sat' || dag === 'Sun';

  // 30 min marge aan beide kanten. Doordeweeks 18:00-01:30, weekend 12:00-02:30 (Peter, 20-08).
  const [openVanaf, dichtVanaf] = weekend ? [11 * 60 + 30, 3 * 60] : [17 * 60 + 30, 2 * 60];
  return minuten >= openVanaf || minuten < dichtVanaf;
}

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
    case 'refreshSource':
      return pool.refreshSource(cmd.tableNumber, cmd.sourceName);
    default:
      throw new Error(`onbekend type ${cmd.type}`);
  }
}

// Camerabron voor de pre-flight per tafel: uit de (genormaliseerde) config, met een
// veilige fallback op de uniforme standaardnaam.
function cameraBronVoor(config, tableNumber) {
  const t = (config.tables || []).find((x) => Number(x.tableNumber) === Number(tableNumber));
  return (t && t.cameraSource) || `Camera Tafel ${tableNumber}`;
}

async function runOnce(config, pool, backend, logger = console, nowMs = Date.now()) {
  const commands = await backend.fetchCommands(config);

  const beheerdeTafels = new Set((config.tables || []).map((t) => Number(t.tableNumber)));
  const verwerkteCommandoIds = [];
  const preflightFails = new Map(); // tafelnr → reden, voor de statusrapportage
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
      // Pre-flight vóór een AUTOMATISCHE start (#43): geen bevroren/dode camera onbewaakt
      // de lucht in. Alleen bij commando's met preflight-vlag (auto uit createBroadcasts);
      // een handmatige start vanaf het dashboard slaat dit over — daar kijkt een mens mee.
      // Niet-live → NIET bevestigen zodat het de volgende tik opnieuw probeert (de camera
      // kan herstellen, zeker met auto-reconnect); wél melden voor het dashboard-alarm.
      if (cmd.type === 'startStream' && cmd.preflight && typeof pool.cameraLevendig === 'function') {
        const cam = cameraBronVoor(config, cmd.tableNumber);
        const check = await pool.cameraLevendig(cmd.tableNumber, cam);
        if (!check.live) {
          preflightFails.set(Number(cmd.tableNumber), check.reden);
          logger.log(`[PREFLIGHT] tafel ${cmd.tableNumber}: ${check.reden} — auto-start uitgesteld`);
          continue; // niet bevestigen → volgende tik opnieuw
        }
      }
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
  // Per tafel parallel i.p.v. een sequentiële for-loop (26-08): een OBS-instantie die
  // druk is met het opzetten van een verse RTMP-verbinding kan een paar minuten traag
  // reageren op websocket-calls (GetStreamStatus e.d.). In een sequentiële loop trekt
  // dát de hele statusronde — en dus ook de andere, probleemloze tafels — met zich mee
  // stil: precies wat er 26-08 gebeurde toen tafel 3 een verse teststream opzette en
  // status.json voor ALLE VIER de tafels tegelijk >2 minuten niet bijwerkte. Elke tafel
  // heeft z'n eigen OBS-verbinding, dus er is niets dat sequentieel hóeft te zijn.
  const tables = await Promise.all(config.tables.map(async (t) => {
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
      // Freeze-watchdog (#43 A2): alleen zinvol op een streamende tafel. Detecteert een
      // bevroren camera en forceert een herlading (het equivalent van Properties → OK).
      // Zelf-throttlend/-debouncend in de pool; draait voor élke stream (ook handmatige).
      let camAlarm;
      if (base.streaming && config.cameraWatchdog && typeof pool.cameraWatchdog === 'function') {
        const cam = cameraBronVoor(config, t.tableNumber);
        const opts = config.cameraWatchdog === true ? {} : config.cameraWatchdog;
        try {
          const w = await pool.cameraWatchdog(t.tableNumber, cam, nowMs, opts);
          if (w.status === 'hersteld') {
            logger.log(`[WATCHDOG] tafel ${t.tableNumber}: camera bevroren (${w.reden}) → herstart uitgevoerd`);
            camAlarm = { cameraFrozen: true, cameraRecovered: true, cameraReason: w.reden };
          } else if (w.status === 'herstel-mislukt') {
            logger.log(`[WATCHDOG] tafel ${t.tableNumber}: herstel mislukt (${w.reden})`);
            camAlarm = { cameraFrozen: true, cameraRecovered: false, cameraReason: w.reden };
          } else if (w.status === 'verdacht') {
            logger.log(`[WATCHDOG] tafel ${t.tableNumber}: mogelijk bevroren (${w.reden}), reeks ${w.reeks}`);
          }
        } catch (e) {
          logger.log(`[WATCHDOG] tafel ${t.tableNumber} mislukt: ${e.message}`);
        }
      }
      const pf = preflightFails.get(Number(t.tableNumber));
      return {
        tableNumber: t.tableNumber,
        ...base,
        ...(overlays ? { overlays } : {}),
        ...(pf ? { preflightFailed: true, preflightReason: pf } : {}),
        ...(camAlarm || {}),
      };
    } catch (e) {
      const pf = preflightFails.get(Number(t.tableNumber));
      return {
        tableNumber: t.tableNumber,
        obsConnected: false,
        streaming: false,
        bitrateKbps: 0,
        ...(pf ? { preflightFailed: true, preflightReason: pf } : {}),
      };
    }
  }));

  await backend.postStatus(config, {
    agentTime: new Date().toISOString(),
    verwerkteCommandoIds,
    tables,
  });

  return { tables, verwerkteCommandoIds };
}

// Trager pollen mag alleen als het ZOWEL buiten bedrijfstijd is ALS er nergens gestreamd
// wordt — de freeze-watchdog moet op een streamende tafel altijd snel blijven reageren,
// ook als die stream tegen de verwachting in buiten de venstertijden doorloopt.
const POLL_MS_RUSTIG_FACTOR = 20; // 3s config -> 60s in de nacht; blijft evenredig bij een andere basisinstelling

// Telt deze ronde als "actief" voor de polling-snelheid? Niet alleen "streamt er al
// iets?", ook "hebben we net iets gedaan?" (28-08): een vers startStream-commando toont
// zichzelf niet meteen als streaming=true — dat duurt soms 1-3 min. (YouTube-
// opwarmtijd, zie #114). Zonder deze uitbreiding kon de agent vlak ná het verwerken van
// zo'n commando alsnog terugvallen op het trage 60s-ritme, precies terwijl hij juist
// snel moest blijven controleren of de start alsnog aansloeg. Lost niet de eerste-
// detectie-vertraging op (die zit inherent in pollen i.p.v. pushen), maar wel het
// stapelen van vertraging ná de eerste hit. Pure functie → apart testbaar van de
// setTimeout-lus eromheen.
function isActieveRonde(tables, verwerkteCommandoIds) {
  return (tables || []).some((t) => t.streaming) || (verwerkteCommandoIds || []).length > 0;
}

function startLoop(config, pool, backend, logger = console) {
  let volgende = config.pollIntervalMs;
  const tick = async () => {
    let actief = false;
    try {
      const { tables, verwerkteCommandoIds } = await runOnce(config, pool, backend, logger);
      actief = isActieveRonde(tables, verwerkteCommandoIds);
    } catch (e) {
      logger.log(`[LOOP] ${e.message}`);
      actief = true; // onbekende status → veilige kant, niet vertragen
    }
    volgende = (isDrukkeTijd() || actief)
      ? config.pollIntervalMs
      : config.pollIntervalMs * POLL_MS_RUSTIG_FACTOR;
    timer = setTimeout(tick, volgende);
  };
  let timer = setTimeout(tick, 0);
  return { stop: () => clearTimeout(timer) };
}

module.exports = { voerCommandoUit, runOnce, startLoop, rotatieZichtbaar, cameraBronVoor, isDrukkeTijd, isActieveRonde };
