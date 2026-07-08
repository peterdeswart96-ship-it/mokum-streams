const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { getTournament } = require('../cuescore');
const { enqueue } = require('../agent/commandQueue');
const { shouldStop } = require('../planning/stop');

// Timer-Function: bewaakt lopende broadcasts en stopt ze automatisch wanneer het
// toernooi klaar is (Cuescore `Finished`), de league-avond op die tafel voorbij is,
// of een handmatige stoptijd is bereikt. Zet dan een stopStream-commando klaar en
// markeert de entry als gestopt (idempotent). Zie wiki/gaps.md #2/#16.

const CRON_ELKE_5_MIN = '0 */5 * * * *';

async function verwerk(now, context) {
  const { datum } = zaalDelen(now);
  const pad = `broadcasts/${datum}.json`;
  const store = (await readJson(pad, {})) || {};
  const planning = (await readJson('planning.json', [])) || [];
  const recById = new Map(planning.map((r) => [String(r.tournamentId), r]));

  const teStoppen = [];
  const cache = new Map();

  for (const key of Object.keys(store)) {
    const entry = store[key];
    if (!entry || entry.stopped || entry.adhoc) continue;

    let tournament = null;
    if (entry.tournamentId != null) {
      const id = String(entry.tournamentId);
      if (cache.has(id)) tournament = cache.get(id);
      else {
        try {
          tournament = await getTournament(entry.tournamentId);
        } catch (e) {
          context.log(`[WAARSCHUWING] stop-check ${id}: ${e.message}`);
        }
        cache.set(id, tournament);
      }
    }

    if (shouldStop(entry, recById.get(String(entry.tournamentId)), tournament, now)) {
      teStoppen.push(entry.tableNumber);
      store[key] = { ...entry, stopped: true };
    }
  }

  if (teStoppen.length > 0) {
    const commands = (await readJson('commands.json', [])) || [];
    const nieuw = teStoppen.map((tn) => ({
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      type: 'stopStream',
      tableNumber: Number(tn),
    }));
    await writeJson('commands.json', enqueue(commands, nieuw));
    await writeJson(pad, store);
    context.log(`[OK] ${teStoppen.length} stopStream-commando(s): tafels ${teStoppen.join(', ')}`);
  }
}

app.timer('checkStops', {
  schedule: CRON_ELKE_5_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
