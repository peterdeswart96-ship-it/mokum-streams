const { app } = require('@azure/functions');
const { readJson, writeJson, writeJsonAlsGewijzigd } = require('../storage/blob');
const { getTodaysTournaments } = require('../cuescore');
const { zaalDag } = require('../schedule/schedule');
const { enqueue, OVERLAY_BRON } = require('../agent/commandQueue');
const { tafelSpeeltNu, volgendeToestand, pauzeCommandos, refreshCommandos } = require('../planning/pauze');
const { isPauzeAutoOn, pauzeSchermKeys, pauzeSchermUitKeys, pauzeSchermRefreshKeys } = require('../config/automation');

// Timer-Function: automatisch pauzescherm (A auto-trigger, zie docs/pauzescherm-auto.md).
// Per streamende tafel checkt 'ie via Cuescore of er een wedstrijd loopt; zo niet
// (na debounce) → Jumbotron + Pauzemelding aan; zodra er weer gespeeld wordt → uit.
// Draait alleen als PAUZESCHERM_AUTO=true én de agent de tafel als 'streaming' meldt.

// Elke minuut op seconde 40 (was elke 30 seconden, #101). Deze timer was met twee tikken
// per minuut de duurste van allemaal: elke ronde een Cuescore-aanroep én een schrijfactie.
// De omslagdrempels zelf zijn tijdgebaseerd (DEBOUNCE_MS / SPELEN_DEBOUNCE_MS hieronder) en
// veranderen dus niet mee; wat verandert is de resolutie waarmee we ze opmerken — een
// omslag kan alleen op een tik gebeuren. Seconde 40 om niet samen te vallen met checkStops
// en liveMatches (sec 0) en liveVideos (sec 20).
const CRON_ELKE_MIN_OFFSET = '40 * * * * *';
const DEBOUNCE_MS = 20000; // 20s 'geen wedstrijd' vóór we naar pauze gaan (anti-flapper)
// En andersom: nadat Cuescore weer een wedstrijd meldt, blijft het pauzescherm nog even
// staan. Een tafeltoewijzing komt uit de loting, maar daarna moeten de spelers er nog
// heen lopen, racken en inspelen. Zonder deze wachttijd kijk je een paar minuten naar
// een lege tafel. Stond op 60s; op 31-08 naar 20s verkort (Peter) — 60s bleek te lang:
// een gemaakte run-out werd niet getoond omdat het pauzescherm nog in beeld stond.
// Instelbaar via app-setting PAUZE_UIT_VERTRAGING_SEC.
const SPELEN_DEBOUNCE_MS = (Number(process.env.PAUZE_UIT_VERTRAGING_SEC) || 20) * 1000;
// Per zaal-dag (net als broadcasts/<datum>.json), niet één eeuwigdurend bestand (26-08):
// de oude, ongedateerde pauze-state.json bleef de staat van de VORIGE keer dat een tafel
// streamde meedragen naar een volgende, compleet andere avond — een tafel die de vorige
// keer toevallig in 'spelen' eindigde (bijv. een geforceerde stop terwijl er nog gespeeld
// werd) begon de volgende avond dus met diezelfde onterechte aanname, i.p.v. netjes
// neutraal in pauze. zaalDag() zorgt dat een avondstream die over middernacht heen loopt
// wél in hetzelfde bestand blijft (zelfde truc als bij checkStops/nachtStop).
function statePad(now) {
  return `pauze-state/${zaalDag(now)}.json`;
}

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
    context.warn(`[pauzeScherm] Cuescore niet bereikbaar (${e.message}) → toestanden ongewijzigd.`);
    return;
  }

  const pad = statePad(now);
  const store = (await readJson(pad, {})) || {};
  const nowMs = now.getTime();
  const pauzeKeys = pauzeSchermKeys();          // aan tijdens pauze (bijv. jumbotron)
  const pauzeUitKeys = pauzeSchermUitKeys();     // aan tijdens spelen, uit bij pauze (bijv. scoreboard)
  const refreshKeys = pauzeSchermRefreshKeys();  // cache verversen bij elke omslag (bijv. scoreboard)
  const commands = [];

  for (const tn of streamend) {
    const speeltNu = tafelSpeeltNu(tournaments, tn);
    const vorige = store[String(tn)] || null;
    const res = volgendeToestand(vorige, speeltNu, nowMs, DEBOUNCE_MS, SPELEN_DEBOUNCE_MS);
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
      // Warning-niveau (24-08, zie #112): logLevel.default staat op Warning, dus een gewone
      // .log() haalt de log-omgeving niet meer — of het pauzescherm daadwerkelijk omschakelde
      // moet zichtbaar blijven, anders is dit soort klachten nooit met de logs te bevestigen.
      context.warn(`[pauzeScherm] tafel ${tn} → ${res.toestand} (pauzescherm ${toonPauze ? 'AAN' : 'uit'})`);
    }
  }

  if (commands.length) {
    const bestaand = (await readJson('commands.json', [])) || [];
    await writeJson('commands.json', enqueue(bestaand, commands));
  }
  // Toestand wegschrijven, maar alleen als er iets aan veranderd is (#101). Dit is met
  // twee tikken per minuut de vaakst schrijvende timer; tussen wedstrijden door staat de
  // toestand vaak een half uur stil. De debounce-timing loopt gewoon door: die zit ín
  // `store`, dus zodra hij verschuift is de vorm anders en wordt er wél geschreven.
  await writeJsonAlsGewijzigd(pad, store);
}

app.timer('pauzeScherm', {
  schedule: CRON_ELKE_MIN_OFFSET,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
