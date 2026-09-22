const { app } = require('@azure/functions');
const crypto = require('crypto');
const { readJson, writeJson, writeJsonAlsGewijzigd } = require('../storage/blob');
const { zaalDag } = require('../schedule/schedule');
const { enqueue, OVERLAY_BRON } = require('../agent/commandQueue');
const { vingerafdruk, volgendeRefreshToestand } = require('../planning/scorebordWacht');
const { TAFELS } = require('../challenge/cuescore');
const { isScorebordWachtAan, scorebordRefreshMs } = require('../config/automation');

// Timer-Function: houdt het Cuescore-scorebord in de uitzending gelijk aan de werkelijkheid (#153).
//
// Op 21-09 stond bij alle uitgezonden wedstrijden urenlang dezelfde stand in beeld. Niet omdat
// niemand de stand bijhield — de teams deden dat wél, en Cuescore bevestigt het: de partijen
// stonden op de juiste tafels, werden bijgewerkt en netjes afgesloten. De data klopte dus; het
// beeld niet.
//
// Het zit in de OBS-browserbron. De overlay-pagina van Cuescore stopt permanent met verversen
// zodra één aanvraag mislukt (`.fail` zet de poll-lus op null, zonder retry). Eén hapering en het
// beeld blijft de rest van de avond staan — op alle tafels tegelijk, want één netwerkhapering
// raakt alle bronnen.
//
// Daarom herladen we de bron zodra er iets nieuws te tonen valt. Een refresh herstelt elke vorm
// van bevriezing, ongeacht de oorzaak, en kost alleen een korte herlaad van ongeveer een seconde.
const OVERLAY_URL = 'https://cuescore.com/ajax/scoreboard/overlay-v2.php';
const TIMEOUT_MS = 8000;

// Seconde 50, zodat deze timer niet samenvalt met checkStops/liveMatches (0), liveVideos (20)
// en pauzeScherm (40). Zonder streamende tafels doet hij niets.
const CRON_ELKE_MIN_OFFSET = '50 * * * * *';

function statePad(now) {
  return `scorebord-state/${zaalDag(now)}.json`;
}

// Haalt op wat de overlay voor deze tafel toont — hetzelfde adres dat de pagina zelf gebruikt,
// zodat we naar precies dezelfde gegevens kijken als de kijker.
async function haalOverlayData(tableId) {
  const res = await fetch(OVERLAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tableId: String(tableId), lang: 'nl' }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function verwerk(now, context, fetchData = haalOverlayData) {
  if (!isScorebordWachtAan()) {
    context.log('[scorebordWacht] SCOREBORD_WACHT=false → slapend.');
    return;
  }

  // Alleen tafels die de agent als streamend meldt: een bron die niet in de lucht is hoeft niet
  // ververst te worden. Bewust voor ÁLLE streams, niet alleen competitie — een browserbron kan
  // op elke avond bevriezen.
  const status = (await readJson('status.json', {})) || {};
  const tafels = ((status.tables || []).filter((t) => t && t.streaming) || []).map((t) => Number(t.tableNumber));
  if (!tafels.length) return;

  const pad = statePad(now);
  const store = (await readJson(pad, {})) || {};
  const minIntervalMs = scorebordRefreshMs();
  const nowMs = now.getTime();
  const commands = [];

  for (const tn of tafels) {
    const tableId = TAFELS[tn];
    if (!tableId) {
      context.warn(`[scorebordWacht] tafel ${tn}: geen Cuescore-tafel-id bekend → overgeslagen.`);
      continue;
    }

    let data = null;
    try {
      data = await fetchData(tableId);
    } catch (e) {
      // Cuescore onbereikbaar → toestand ongewijzigd laten. Een mislukte aanvraag zegt niets over
      // wat er in beeld staat.
      context.warn(`[scorebordWacht] tafel ${tn}: Cuescore niet bereikbaar (${e.message}) → ongewijzigd.`);
      continue;
    }

    const afdruk = vingerafdruk(data);
    const vorige = store[String(tn)] || null;
    const res = volgendeRefreshToestand(vorige, afdruk, nowMs, minIntervalMs);
    store[String(tn)] = { afdruk: res.afdruk, laatsteRefresh: res.laatsteRefresh };

    if (!res.verversen) continue;

    commands.push({
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      type: 'refreshSource',
      tableNumber: tn,
      sourceName: OVERLAY_BRON.scoreboard,
    });
    // Warning-niveau (zie #112): logLevel.default staat op Warning, dus een gewone .log() haalt
    // de log-omgeving niet. Deze regel is het bewijs dat het scorebord meebeweegt met de stand —
    // precies wat op 21-09 ontbrak.
    context.warn(`[scorebordWacht] tafel ${tn}: scorebord ververst — nieuwe stand "${res.afdruk}"`);
  }

  if (commands.length) {
    const bestaand = (await readJson('commands.json', [])) || [];
    await writeJson('commands.json', enqueue(bestaand, commands));
  }
  await writeJsonAlsGewijzigd(pad, store);
}

app.timer('scorebordWacht', {
  schedule: CRON_ELKE_MIN_OFFSET,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
