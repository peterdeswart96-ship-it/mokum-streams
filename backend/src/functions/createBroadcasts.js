const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen, tafelsNogTeMaken } = require('../schedule/schedule');
const { dueRecords, effectiveStart } = require('../planning/planning');
const { buildBroadcastTitle, createBroadcast, bindBroadcast } = require('../youtube/broadcasts');

// Timer-Function (#9): maakt vooruit de YouTube-broadcasts aan voor planning-records
// die binnenkort starten. Leest planning.json (Cuescore-import + per-toernooi
// instellingen, zie importPlanning.js + api-contract v0.5). Idempotent per tafel/dag.
//
// - Alleen `enabled` records; doorlopende competities worden (nog) overgeslagen
//   (die krijgen per-avond-logica; zie wiki/gaps.md #14/#16).
// - Titel = de (Cuescore-)naam van het toernooi; scheduledStart = effectieve start.
// - Per gekozen tafel een broadcast, gebonden aan de vaste stream key.

const CRON_ELKE_5_MIN = '0 */5 * * * *';

async function verwerk(now, context) {
  const tables = (await readJson('config/tables.json', [])) || [];
  const planning = (await readJson('planning.json', [])) || [];
  const tableById = new Map(tables.map((t) => [Number(t.tableNumber), t]));

  const due = dueRecords(planning, now);
  if (due.length === 0) {
    context.log('Geen planning-records aan de beurt.');
    return;
  }

  const { datum } = zaalDelen(now);
  const broadcastsPad = `broadcasts/${datum}.json`;
  const store = (await readJson(broadcastsPad, {})) || {};

  for (const rec of due) {
    const toernooinaam = rec.name || '';
    const start = effectiveStart(rec);
    // Idempotent: sla tafels over die vandaag al een broadcast hebben.
    const tafels = tafelsNogTeMaken({ tafels: rec.tafels || [] }, store);

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

  const leagues = planning.filter((r) => (r.type || '') === 'competition' && r.enabled !== false).length;
  if (leagues > 0) {
    context.log(`[INFO] ${leagues} doorlopende competitie(s) overgeslagen — per-avond-logica volgt (#14/#16).`);
  }
}

app.timer('createBroadcasts', {
  schedule: CRON_ELKE_5_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
