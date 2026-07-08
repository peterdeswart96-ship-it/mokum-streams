const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen, tafelsNogTeMaken } = require('../schedule/schedule');
const { dueRecords, effectiveStart } = require('../planning/planning');
const { leagueDueTables } = require('../planning/league');
const { getTournament } = require('../cuescore');
const { buildBroadcastTitle, createBroadcast, bindBroadcast } = require('../youtube/broadcasts');

// Timer-Function (#9 + optie 2): maakt vooruit de YouTube-broadcasts aan.
// - Enkeldaagse toernooien: uit planning.json op basis van effectieve start.
// - Doorlopende competities (leagues): per avond, voor de camera's met een
//   league-wedstrijd vandaag (getTournament → leagueDueTables).
// Idempotent per tafel/dag (broadcasts/<datum>.json).

const CRON_ELKE_5_MIN = '0 */5 * * * *';

async function verwerk(now, context) {
  const tables = (await readJson('config/tables.json', [])) || [];
  const planning = (await readJson('planning.json', [])) || [];
  const tableById = new Map(tables.map((t) => [Number(t.tableNumber), t]));

  const { datum } = zaalDelen(now);
  const broadcastsPad = `broadcasts/${datum}.json`;
  const store = (await readJson(broadcastsPad, {})) || {};

  // Maakt (idempotent) een broadcast voor een tafel; werkt de store bij.
  async function maakBroadcast(tafelNr, toernooinaam, startIso) {
    if (store[String(tafelNr)]) return; // vandaag al gemaakt
    const table = tableById.get(Number(tafelNr));
    if (!table || !table.streamId) {
      context.log(`[FOUT] Tafel ${tafelNr} heeft geen streamId in config/tables.json — overslaan.`);
      return;
    }
    const title = buildBroadcastTitle({ tafel: tafelNr, toernooinaam });
    try {
      const broadcast = await createBroadcast({ title, scheduledStartTime: startIso });
      await bindBroadcast({ broadcastId: broadcast.id, streamId: table.streamId });
      store[String(tafelNr)] = {
        tableNumber: Number(tafelNr),
        videoId: broadcast.id,
        broadcastId: broadcast.id,
        title,
        scheduledStart: startIso,
      };
      context.log(`[OK] Broadcast aangemaakt: tafel ${tafelNr} — "${title}" (${broadcast.id})`);
    } catch (e) {
      context.log(`[FOUT] Broadcast tafel ${tafelNr} mislukt: ${e.message}`);
    }
  }

  // 1) Enkeldaagse toernooien
  for (const rec of dueRecords(planning, now)) {
    const start = effectiveStart(rec);
    for (const tafelNr of tafelsNogTeMaken({ tafels: rec.tafels || [] }, store)) {
      await maakBroadcast(tafelNr, rec.name || '', start);
    }
  }

  // 2) Doorlopende competities (per avond)
  for (const rec of planning.filter((r) => r.type === 'competition' && r.enabled !== false)) {
    let tournament;
    try {
      tournament = await getTournament(rec.tournamentId);
    } catch (e) {
      context.log(`[WAARSCHUWING] League ${rec.tournamentId} ophalen mislukt: ${e.message}`);
      continue;
    }
    for (const { tableNumber, earliestStart } of leagueDueTables(tournament, rec, now)) {
      await maakBroadcast(tableNumber, rec.name || '', earliestStart);
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
