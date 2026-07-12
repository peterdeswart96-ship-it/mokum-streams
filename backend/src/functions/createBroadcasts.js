const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen, tafelsNogTeMaken } = require('../schedule/schedule');
const { dueRecords, effectiveStart } = require('../planning/planning');
const { leagueDueTables } = require('../planning/league');
const { getTournament } = require('../cuescore');
const { enqueue, startCommandsFor } = require('../agent/commandQueue');
const { buildBroadcastTitle, buildBroadcastDescription, createBroadcast, bindBroadcast } = require('../youtube/broadcasts');
const { isArmed } = require('../config/automation');

// Timer-Function (#9 + optie 2 + start-automatisering): maakt vooruit de
// YouTube-broadcasts aan én zet de start-/overlay-commando's voor de agent klaar.
// - Enkeldaagse toernooien: uit planning.json op basis van effectieve start.
// - Doorlopende competities (leagues): per avond, per camera-tafel met een
//   league-wedstrijd vandaag.
// Idempotent per tafel/dag (broadcasts/<datum>.json). Commando's worden alleen bij
// een NIEUW aangemaakte broadcast in de wachtrij gezet (niet nogmaals bij herhaling).

const CRON_ELKE_5_MIN = '0 */5 * * * *';

async function verwerk(now, context) {
  if (!isArmed()) {
    context.log('[createBroadcasts] AUTOMATION_ARMED != true → slapend; geen broadcasts aangemaakt.');
    return;
  }
  const tables = (await readJson('config/tables.json', [])) || [];
  const planning = (await readJson('planning.json', [])) || [];
  const tableById = new Map(tables.map((t) => [Number(t.tableNumber), t]));

  const { datum } = zaalDelen(now);
  const broadcastsPad = `broadcasts/${datum}.json`;
  const store = (await readJson(broadcastsPad, {})) || {};

  const nieuweCommandos = [];

  // Maakt (idempotent) een broadcast voor een tafel en zet de start-commando's klaar.
  async function maakBroadcast(rec, tafelNr, startIso) {
    if (store[String(tafelNr)]) return; // vandaag al gemaakt
    const table = tableById.get(Number(tafelNr));
    if (!table || !table.streamId) {
      context.log(`[FOUT] Tafel ${tafelNr} heeft geen streamId in config/tables.json — overslaan.`);
      return;
    }
    const title = buildBroadcastTitle({ tafel: tafelNr, toernooinaam: rec.name || '' });
    const description = buildBroadcastDescription({ toernooinaam: rec.name || '' });
    try {
      const broadcast = await createBroadcast({ title, description, scheduledStartTime: startIso });
      await bindBroadcast({ broadcastId: broadcast.id, streamId: table.streamId });
      store[String(tafelNr)] = {
        tableNumber: Number(tafelNr),
        tournamentId: rec.tournamentId,
        tournamentName: rec.name || '',
        videoId: broadcast.id,
        broadcastId: broadcast.id,
        title,
        scheduledStart: startIso,
      };
      // Agent: OBS starten + overlays op de gewenste stand.
      const overlayBron = table.overlaySources || undefined;
      nieuweCommandos.push(...startCommandsFor(rec, Number(tafelNr), overlayBron));
      context.log(`[OK] Broadcast + startcommando's: tafel ${tafelNr} — "${title}" (${broadcast.id})`);
    } catch (e) {
      context.log(`[FOUT] Broadcast tafel ${tafelNr} mislukt: ${e.message}`);
    }
  }

  // 1) Enkeldaagse toernooien
  for (const rec of dueRecords(planning, now)) {
    const start = effectiveStart(rec);
    for (const tafelNr of tafelsNogTeMaken({ tafels: rec.tafels || [] }, store)) {
      await maakBroadcast(rec, tafelNr, start);
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
      await maakBroadcast(rec, tableNumber, earliestStart);
    }
  }

  await writeJson(broadcastsPad, store);

  // Nieuwe commando's (met id + tijd) achteraan de wachtrij zetten.
  if (nieuweCommandos.length > 0) {
    const bestaand = (await readJson('commands.json', [])) || [];
    const metId = nieuweCommandos.map((c) => ({ id: crypto.randomUUID(), createdAt: now.toISOString(), ...c }));
    await writeJson('commands.json', enqueue(bestaand, metId));
    context.log(`[OK] ${metId.length} commando's toegevoegd aan de wachtrij.`);
  }
}

app.timer('createBroadcasts', {
  schedule: CRON_ELKE_5_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
