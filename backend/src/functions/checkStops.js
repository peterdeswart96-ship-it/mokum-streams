const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { getTournament } = require('../cuescore');
const { enqueue } = require('../agent/commandQueue');
const { shouldStop, toernooiKlaar } = require('../planning/stop');
const { isArmed } = require('../config/automation');

// Timer-Function: bewaakt lopende broadcasts en stopt ze automatisch wanneer het
// toernooi klaar is (Cuescore `Finished`), de league-avond op die tafel voorbij is,
// of een handmatige stoptijd is bereikt. Zet dan een stopStream-commando klaar en
// markeert de entry als gestopt (idempotent). Zie wiki/gaps.md #2/#16.
//
// Podium-grace (#54/#57): zodra een enkeldaags toernooi klaar is, stempelen we het
// moment (finaleKlaarSinds) op de entry en stoppen we pas STOP_GRACE_MS later — zo
// blijft het medaillescherm eerst ~1 min in beeld. Daarom draait deze check elke
// minuut (niet elke 5), zodat die minuut ook echt klopt.

const CRON_ELKE_MIN = '0 * * * * *';
const STOP_GRACE_MS = 60 * 1000; // podium ~1 min tonen na de finale, dan pas sluiten

async function verwerk(now, context) {
  if (!isArmed()) {
    context.log('[checkStops] AUTOMATION_ARMED != true → slapend; geen automatische stops.');
    return;
  }
  const { datum } = zaalDelen(now);
  const pad = `broadcasts/${datum}.json`;
  const store = (await readJson(pad, {})) || {};
  const planning = (await readJson('planning.json', [])) || [];
  const recById = new Map(planning.map((r) => [String(r.tournamentId), r]));

  const teStoppen = [];
  const cache = new Map();
  let storeGewijzigd = false;

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

    const rec = recById.get(String(entry.tournamentId));
    const type = (rec && rec.type) || 'tournament';

    // Stempel het moment waarop het toernooi klaar is (voor de podium-grace) — óók als
    // we nu nog niet stoppen. Zo weet shouldStop volgende ronde hoelang het podium al staat.
    if (type !== 'competition' && !entry.finaleKlaarSinds && toernooiKlaar(entry, tournament, now)) {
      entry.finaleKlaarSinds = now.toISOString();
      store[key] = entry;
      storeGewijzigd = true;
      context.log(`[checkStops] tafel ${entry.tableNumber}: toernooi klaar → podium-grace gestart.`);
    }

    if (shouldStop(entry, rec, tournament, now, { graceMs: STOP_GRACE_MS })) {
      teStoppen.push(entry.tableNumber);
      store[key] = { ...entry, stopped: true };
      storeGewijzigd = true;
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
    context.log(`[OK] ${teStoppen.length} stopStream-commando(s): tafels ${teStoppen.join(', ')}`);
  }
  if (storeGewijzigd) await writeJson(pad, store);
}

app.timer('checkStops', {
  schedule: CRON_ELKE_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
