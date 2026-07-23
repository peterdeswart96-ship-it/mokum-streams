const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { getTournament, getTodaysTournaments } = require('../cuescore');
const { enqueue } = require('../agent/commandQueue');
const { shouldStop, toernooiKlaar } = require('../planning/stop');
const { kiesToernooiVoorTafel, anderToernooiNogOpTafel } = require('../planning/koppel');
const { isArmed } = require('../config/automation');

// Timer-Function: bewaakt lopende broadcasts en stopt ze automatisch wanneer het
// toernooi klaar is (Cuescore `Finished`), de league-avond op die tafel voorbij is,
// of een handmatige stoptijd is bereikt. Zet dan een stopStream-commando klaar en
// markeert de entry als gestopt (idempotent). Zie wiki/gaps.md #2/#16.
//
// Podium-grace (#54/#57): zodra een enkeldaags toernooi klaar is, stempelen we het
// moment (finaleKlaarSinds) op de entry en stoppen we pas STOP_GRACE_MS later — zo
// blijft het medaillescherm eerst in beeld. Daarom draait deze check elke minuut
// (niet elke 5), zodat die tijd ook echt klopt.
//
// Ad-hoc koppeling (#69): een handmatig gestarte stream heeft geen tournamentId en
// viel daardoor buiten de hele automatisering. We proberen 'm hier alsnog aan het
// Cuescore-toernooi op die tafel te koppelen; daarna loopt de normale keten
// (podium-grace → stop → finalize met thumbnail + hoofdstukken) gewoon door.

const CRON_ELKE_MIN = '0 * * * * *';
// Hoelang het medaillescherm in beeld blijft vóór we sluiten. Ruim genoeg dat de
// keten (liveMatches → pauzescherm → overlay) 'm echt op de uitzending krijgt.
// Instelbaar via app-setting PODIUM_GRACE_SEC.
const STOP_GRACE_MS = (Number(process.env.PODIUM_GRACE_SEC) || 180) * 1000;

async function verwerk(now, context) {
  if (!isArmed()) {
    context.log('[checkStops] AUTOMATION_ARMED != true → slapend; geen automatische stops.');
    return;
  }
  // Een avondstream zit ná middernacht nog in de store van gisteren → check beide dagen
  // (net als nachtStop). Anders wordt zo'n stream na 0:00 niet meer gestopt/gefinaliseerd
  // en blijft de podium-grace uit (incident 21-07).
  const gisteren = new Date(now.getTime() - 24 * 3600 * 1000);
  const dagen = [now, gisteren]
    .map((ref) => ({ pad: `broadcasts/${zaalDelen(ref).datum}.json`, ref }))
    .filter((d, i, arr) => arr.findIndex((x) => x.pad === d.pad) === i);
  const planning = (await readJson('planning.json', [])) || [];
  const recById = new Map(planning.map((r) => [String(r.tournamentId), r]));

  const teStoppen = [];
  const cache = new Map();

  // Toernooien van een zaal-dag: lazy ophalen (alleen als een ad-hoc/gekoppelde stream
  // ze nodig heeft) en cachen per dag. Een avondstream die ná 0:00 nog loopt hoort bij
  // de dag van GISTEREN — daarom per broadcast-dag, niet altijd "vandaag".
  const dagCache = new Map();
  async function toernooienVanDag(ref) {
    const sleutel = zaalDelen(ref).datum;
    if (!dagCache.has(sleutel)) {
      try {
        dagCache.set(sleutel, await getTodaysTournaments({ now: ref }));
      } catch (e) {
        context.log(`[checkStops] toernooien van ${sleutel} ophalen mislukt: ${e.message}`);
        dagCache.set(sleutel, null);
      }
    }
    return dagCache.get(sleutel);
  }

  for (const { pad, ref } of dagen) {
    const store = (await readJson(pad, {})) || {};
    let storeGewijzigd = false;

    for (const key of Object.keys(store)) {
      let entry = store[key];
      if (!entry || entry.stopped) continue;

      // Handmatig gestart zonder toernooi? Probeer alsnog te koppelen (#69). Lukt dat
      // niet (niets gevonden of te onzeker), dan blijft de stream handmatig.
      if (entry.adhoc || entry.tournamentId == null) {
        const lijst = await toernooienVanDag(ref);
        const gevonden = lijst && kiesToernooiVoorTafel(lijst, entry.tableNumber, ref);
        if (!gevonden) continue;
        entry = {
          ...entry,
          tournamentId: gevonden.id,
          tournamentName: gevonden.name || entry.tournamentName || '',
          adhoc: false,
          autoGekoppeld: now.toISOString(),
        };
        store[key] = entry;
        storeGewijzigd = true;
        cache.set(String(gevonden.id), gevonden);
        context.log(`[checkStops] tafel ${entry.tableNumber}: ad-hoc stream gekoppeld aan "${gevonden.name}" (${gevonden.id}) → automatisering actief.`);
      }

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
        // Automatisch gekoppeld? Sluit de tafel pas als er vandaag écht niets meer op
        // staat — ook niet in een ánder toernooi (bijv. twee qualifiers op één avond).
        if (entry.autoGekoppeld) {
          const lijst = await toernooienVanDag(ref);
          if (lijst && anderToernooiNogOpTafel(lijst, entry.tournamentId, entry.tableNumber, ref)) {
            context.log(`[checkStops] tafel ${entry.tableNumber}: toernooi klaar, maar er staat vandaag nog een ander toernooi op deze tafel → nog niet sluiten.`);
            continue;
          }
        }
        teStoppen.push(entry.tableNumber);
        store[key] = { ...entry, stopped: true };
        storeGewijzigd = true;
      }
    }

    if (storeGewijzigd) await writeJson(pad, store);
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
}

app.timer('checkStops', {
  schedule: CRON_ELKE_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
