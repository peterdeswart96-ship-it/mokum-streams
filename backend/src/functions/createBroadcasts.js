const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { dueRules, tafelsNogTeMaken, zaalDelen, scheduledStartISO } = require('../schedule/schedule');
const { getTodaysTournaments, findTournamentByName } = require('../cuescore');
const { buildBroadcastTitle, createBroadcast, bindBroadcast } = require('../youtube/broadcasts');

// Timer-Function (#9): maakt vooruit de YouTube-broadcasts aan voor toernooien die
// binnenkort starten. Draait elke 5 minuten. Idempotent: een tafel die vandaag al
// een broadcast heeft, wordt overgeslagen.
//
// Flow per due-regel:
//   1. toernooinaam bepalen (Cuescore-naam die de regel-naam bevat; anders de
//      naam uit de regel als fallback)
//   2. titel bouwen (Tafel {nr} {toernooinaam})
//   3. broadcast aanmaken + binden aan de vaste stream key van de tafel
//   4. resultaat opslaan in broadcasts/<datum>.json (bron voor /api/live)

const CRON_ELKE_5_MIN = '0 */5 * * * *';

async function verwerk(now, context) {
  const tables = (await readJson('config/tables.json', [])) || [];
  const schedule = (await readJson('config/schedule.json', [])) || [];
  const tableById = new Map(tables.map((t) => [Number(t.tableNumber), t]));

  const teDoen = dueRules(schedule, now);
  if (teDoen.length === 0) {
    context.log('Geen schema-regels aan de beurt.');
    return;
  }

  const { datum } = zaalDelen(now);
  const broadcastsPad = `broadcasts/${datum}.json`;
  const store = (await readJson(broadcastsPad, {})) || {};

  // Cuescore-toernooien van vandaag één keer ophalen (voor de titel).
  let toernooienVandaag = [];
  try {
    toernooienVandaag = await getTodaysTournaments({ now });
  } catch (e) {
    context.log(`[WAARSCHUWING] Cuescore ophalen mislukt, val terug op regel-namen: ${e.message}`);
  }

  for (const regel of teDoen) {
    const tafels = tafelsNogTeMaken(regel, store);
    if (tafels.length === 0) continue;

    // Titel-toernooinaam: de actuele Cuescore-naam die de regel-naam bevat, anders de regel.
    const match = findTournamentByName(toernooienVandaag, regel.toernooinaam);
    const toernooinaam = (match && match.name) || regel.toernooinaam || '';
    const start = scheduledStartISO(now, regel.startTijd);

    for (const tafelNr of tafels) {
      const table = tableById.get(Number(tafelNr));
      if (!table || !table.streamId) {
        context.log(`[FOUT] Tafel ${tafelNr} heeft geen streamId in config/tables.json — overslaan.`);
        continue;
      }
      const title = buildBroadcastTitle({ tafel: tafelNr, toernooinaam });
      try {
        const broadcast = await createBroadcast({ title, scheduledStartTime: start });
        await bindBroadcast({ broadcastId: broadcast.id, streamId: table.streamId });
        store[String(tafelNr)] = {
          tableNumber: Number(tafelNr),
          videoId: broadcast.id,
          broadcastId: broadcast.id,
          title,
          scheduledStart: start,
        };
        context.log(`[OK] Broadcast aangemaakt: tafel ${tafelNr} — "${title}" (${broadcast.id})`);
      } catch (e) {
        context.log(`[FOUT] Broadcast tafel ${tafelNr} mislukt: ${e.message}`);
      }
    }
  }

  await writeJson(broadcastsPad, store);
}

app.timer('createBroadcasts', {
  schedule: CRON_ELKE_5_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
