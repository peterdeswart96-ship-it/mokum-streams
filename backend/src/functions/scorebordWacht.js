const { app } = require('@azure/functions');
const crypto = require('crypto');
const { readJson, writeJson, writeJsonAlsGewijzigd } = require('../storage/blob');
const { zaalDag } = require('../schedule/schedule');
const { enqueue, OVERLAY_BRON } = require('../agent/commandQueue');
const { competitieTafels } = require('../planning/pauze');
const { vingerafdruk, volgendeScorebordToestand } = require('../planning/scorebordWacht');
const { TAFELS } = require('../challenge/cuescore');
const { isScorebordWachtAan, scorebordStilMs } = require('../config/automation');

// Timer-Function: vangnet voor het Cuescore-scorebord op competitietafels (#153).
//
// Op 21-09 stond er drie en een half uur lang 0-0 in beeld terwijl er allang twee anderen
// speelden: de partij was wél aan de tafel gekoppeld, maar niemand werkte de stand bij. Op
// 17-09 ging het goed, bij precies dezelfde opzet — het hangt dus aan handmatige invoer.
// Daarom laten we het scorebord staan (het is het mooiste beeld dat er is als het klopt), maar
// halen we het weg zodra het aantoonbaar achterloopt.
//
// We vragen exact op wat de overlay zelf ophaalt, zodat we zien wat de kijker ziet. Elke andere
// bron kan iets anders zeggen dan wat er in beeld staat.
const OVERLAY_URL = 'https://cuescore.com/ajax/scoreboard/overlay-v2.php';
const TIMEOUT_MS = 8000;

// Seconde 50, zodat deze timer niet samenvalt met checkStops/liveMatches (0), liveVideos (20)
// en pauzeScherm (40). Draait alleen echt door bij een lopende competitiestream, dus op een
// gewone avond kost dit niets.
const CRON_ELKE_MIN_OFFSET = '50 * * * * *';

function statePad(now) {
  return `scorebord-state/${zaalDag(now)}.json`;
}

// Haalt op wat de overlay voor deze tafel toont. Retour: het JSON-antwoord, of null bij een
// fout — dan doen we niets (zie vingerafdruk(): geen oordeel).
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

  // Alleen tafels die én streamen én een lopende competitiestream hebben. Bij een toernooistream
  // beheert Cuescore de tafeltoewijzing zelf en dekt het pauzescherm dit al af; competitiestreams
  // zijn daar sinds #155 juist van uitgesloten, dus hier nemen we die rol over.
  const status = (await readJson('status.json', {})) || {};
  const streamend = ((status.tables || []).filter((t) => t && t.streaming) || []).map((t) => Number(t.tableNumber));
  if (!streamend.length) return;

  const broadcasts = (await readJson(`broadcasts/${zaalDag(now)}.json`, {})) || {};
  const competitie = competitieTafels(broadcasts);
  const tafels = streamend.filter((tn) => competitie.has(tn));
  if (!tafels.length) return;

  const pad = statePad(now);
  const store = (await readJson(pad, {})) || {};
  const drempelMs = scorebordStilMs();
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
      // Cuescore onbereikbaar → geen oordeel, toestand ongewijzigd (niet flapperen).
      context.warn(`[scorebordWacht] tafel ${tn}: Cuescore niet bereikbaar (${e.message}) → ongewijzigd.`);
      continue;
    }

    const afdruk = vingerafdruk(data);

    // Diagnose (#153): herkennen we de stand niet terwijl Cuescore wél iets anders dan WAITING
    // meldt, dan kloppen onze veldnamen niet en doet dit vangnet stilletjes niets. Dat is veilig,
    // maar je moet het wél te weten komen - vandaar deze regel, één keer per tafel per zaal-dag.
    // De sleutels van het antwoord staan erbij; daarmee is vingerafdruk() meteen af te stellen.
    const csStatus = String((data && data.status) || '').toUpperCase();
    if (afdruk == null && csStatus && csStatus !== 'WAITING') {
      const gemeld = store[String(tn)] && store[String(tn)].onbekendGemeld;
      if (!gemeld) {
        context.warn(
          `[scorebordWacht] tafel ${tn}: stand niet herkend in het Cuescore-antwoord (status ${csStatus})`
          + ` - velden: ${Object.keys(data || {}).join(', ')} - vangnet doet niets, veldnamen controleren`
        );
      }
    }

    const vorige = store[String(tn)] || null;
    const res = volgendeScorebordToestand(vorige, afdruk, nowMs, drempelMs);
    store[String(tn)] = {
      afdruk: res.afdruk,
      sinds: res.sinds,
      verborgen: res.verborgen,
      // Eenmalig gemeld dat we de stand niet herkennen - anders elke minuut dezelfde regel.
      onbekendGemeld: afdruk == null && csStatus && csStatus !== 'WAITING' ? true : undefined,
    };

    if (!res.actie) continue;

    const aan = res.actie === 'tonen';
    commands.push({
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      type: 'setOverlay',
      tableNumber: tn,
      sourceName: OVERLAY_BRON.scoreboard,
      enabled: aan,
    });
    // Warning-niveau (zie #112): logLevel.default staat op Warning, dus een gewone .log() haalt
    // de log-omgeving niet. Juist deze omslag moet terug te vinden zijn als iemand vraagt waarom
    // het scorebord halverwege verdween. De ruwe afdruk staat erbij: daarmee zijn de veldnamen
    // na de eerste competitieavond exact af te stellen.
    const stilMin = Math.round((nowMs - Number(res.sinds || nowMs)) / 60000);
    context.warn(
      `[scorebordWacht] tafel ${tn}: scorebord ${aan ? 'weer AAN (stand beweegt)' : `UIT (stand ${stilMin} min onveranderd)`}`
      + ` — afdruk "${res.afdruk}"`
    );
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
