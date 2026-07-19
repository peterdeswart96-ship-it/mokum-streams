const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { getTodaysTournaments } = require('../cuescore');
const { enqueue, OVERLAY_BRON } = require('../agent/commandQueue');
const { tafelSpeeltNu, volgendeToestand, pauzeCommandos, refreshCommandos } = require('../planning/pauze');
const { isPauzeAutoOn, pauzeSchermKeys, pauzeSchermUitKeys, pauzeSchermRefreshKeys } = require('../config/automation');

// Timer-Function: automatisch pauzescherm (A auto-trigger, zie docs/pauzescherm-auto.md).
// Per streamende tafel checkt 'ie via Cuescore of er een wedstrijd loopt; zo niet
// (na debounce) → Jumbotron + Pauzemelding aan; zodra er weer gespeeld wordt → uit.
// Draait alleen als PAUZESCHERM_AUTO=true én de agent de tafel als 'streaming' meldt.

const CRON_ELKE_30_SEC = '*/30 * * * * *';
const DEBOUNCE_MS = 20000; // 20s 'geen wedstrijd' vóór we naar pauze gaan (anti-flapper)
const STATE_PAD = 'pauze-state.json';

async function verwerk(now, context) {
  if (!isPauzeAutoOn()) {
    context.log('[pauzeScherm] PAUZESCHERM_AUTO != true → slapend.');
    return;
  }

  // Alleen tafels die de agent als streamend meldt (pauzescherm is zinloos zonder live stream).
  const status = (await readJson('status.json', {})) || {};
  const streamend = ((status.tables || []).filter((t) => t && t.streaming) || []).map((t) => Number(t.tableNumber));
  if (!streamend.length) {
    context.log('[pauzeScherm] geen streamende tafels → niets te doen.');
    return;
  }

  // Live toernooidata (één keer ophalen, hergebruikt voor alle tafels). Fail-safe:
  // bij een fout de toestanden ONgewijzigd laten (niet flapperen).
  let tournaments;
  try {
    tournaments = await getTodaysTournaments({ now });
  } catch (e) {
    context.log(`[pauzeScherm] Cuescore niet bereikbaar (${e.message}) → toestanden ongewijzigd.`);
    return;
  }

  const store = (await readJson(STATE_PAD, {})) || {};
  const nowMs = now.getTime();
  const pauzeKeys = pauzeSchermKeys();          // aan tijdens pauze (bijv. jumbotron)
  const pauzeUitKeys = pauzeSchermUitKeys();     // aan tijdens spelen, uit bij pauze (bijv. scoreboard)
  const refreshKeys = pauzeSchermRefreshKeys();  // cache verversen bij elke omslag (bijv. scoreboard)
  const commands = [];

  for (const tn of streamend) {
    const speeltNu = tafelSpeeltNu(tournaments, tn);
    const vorige = store[String(tn)] || null;
    const res = volgendeToestand(vorige, speeltNu, nowMs, DEBOUNCE_MS);
    store[String(tn)] = { toestand: res.toestand, sinds: res.sinds, wachtSinds: res.wachtSinds };

    if (res.veranderd) {
      const toonPauze = res.toestand === 'pauze';
      // Pauze-overlays (jumbotron) AAN tijdens pauze; inverse-overlays (scoreboard) juist
      // UIT tijdens pauze en AAN tijdens spelen — zodat een oud toernooi niet blijft hangen.
      const rauw = [
        ...pauzeCommandos(tn, toonPauze, OVERLAY_BRON, pauzeKeys),
        ...pauzeCommandos(tn, !toonPauze, OVERLAY_BRON, pauzeUitKeys),
        // Bij elke omslag de cache van (bijv.) het scorebord verversen → geen oud toernooi.
        ...refreshCommandos(tn, OVERLAY_BRON, refreshKeys),
      ];
      const cmds = rauw.map((c) => ({ id: crypto.randomUUID(), createdAt: now.toISOString(), ...c }));
      commands.push(...cmds);
      context.log(`[pauzeScherm] tafel ${tn} → ${res.toestand} (pauzescherm ${toonPauze ? 'AAN' : 'uit'})`);
    }
  }

  if (commands.length) {
    const bestaand = (await readJson('commands.json', [])) || [];
    await writeJson('commands.json', enqueue(bestaand, commands));
  }
  // Toestand altijd wegschrijven (debounce-timing loopt door tussen runs).
  await writeJson(STATE_PAD, store);
}

app.timer('pauzeScherm', {
  schedule: CRON_ELKE_30_SEC,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
