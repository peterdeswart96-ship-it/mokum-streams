const { app } = require('@azure/functions');
const { readJson, writeJsonAlsGewijzigd } = require('../storage/blob');
const { getTodaysTournaments } = require('../cuescore');
const { bouwLiveMatches, telZaalLive, bouwZaalRaster } = require('../planning/pauze');
const { podiumVoorZaal, podiumPerTafel } = require('../planning/podium');
const { zaalDag } = require('../schedule/schedule');
const { getWedstrijdenVandaag } = require('../mokumCompetitie');
const { competitieVoorLive } = require('../mokumCompetitie/vandaag');

// Timer-Function: haalt periodiek de live wedstrijd-status per cameratafel op uit
// Cuescore en schrijft die naar live-matches.json. Puur lees-werk (geen streams/
// broadcasts) → veilig, ook tijdens een lopend toernooi. Voedt GET /api/live zodat
// het dashboard per tafel toont wat er nu speelt (spelers + stand). Fail-safe: bij
// een Cuescore-fout laten we de vorige stand staan.

const CRON_ELKE_MIN = '0 * * * * *';
const CAMERAS_DEFAULT = [1, 3, 15, 16];

async function verwerk(now, context) {
  const tables = (await readJson('config/tables.json', [])) || [];
  const cameras = tables.length ? tables.map((t) => Number(t.tableNumber)) : CAMERAS_DEFAULT;

  let tournaments;
  try {
    tournaments = await getTodaysTournaments({ now });
  } catch (e) {
    // Warning-niveau (28-08, #117-vervolg): logLevel.default staat op Warning (#110) —
    // zonder dit blijft een langdurige Cuescore-storing onopgemerkt terwijl het dashboard
    // stilletjes op verouderde standen blijft draaien.
    context.warn(`[liveMatches] Cuescore niet bereikbaar (${e.message}) → vorige stand behouden.`);
    return;
  }

  const matches = bouwLiveMatches(tournaments, cameras, now);
  const venueLive = telZaalLive(tournaments);
  // venueTables = zaalbreed raster (alle tafels met een wedstrijd) voor het eigen
  // Mokum-tafelraster in het pauzescherm (#54).
  const venueTables = bouwZaalRaster(tournaments, now);
  // podium = medaillescherm van een net-afgerond toernooi (winnaar-moment #54); kijkt
  // alleen naar de cameratafels. null zolang een cameratafel nog speelt of geen finale
  // gespeeld is. LET OP (#104): dit veld is zaalbreed — het blokkeert op ELKE cameratafel
  // zodra er ergens in de zaal nog een cameratafel speelt, ook als dat een heel ander
  // toernooi is. Blijft ongewijzigd staan voor de jumbotron-instanties die nog geen eigen
  // tafelnummer meesturen (?tafel=N) — zie podiumPerTafel hieronder voor de juiste,
  // per-tafel-versie.
  const podium = podiumVoorZaal(tournaments, cameras);
  // podiumPerTafel: zelfde afleiding, maar per cameratafel — een tafel waarvan het EIGEN
  // toernooi klaar is toont zijn podium, ongeacht wat er op een andere cameratafel speelt.
  // Actief zodra de jumbotron-OBS-bron van die tafel `?tafel=N` in de URL heeft staan.
  // Lopende streams per tafel → toernooi-id, zodat een podium alleen op tafels komt waar de stream
  // bij dat toernooi hoort (04-10). Een mislukte lezing mag de timer niet stuk maken.
  const streamToernooi = {};
  try {
    const store = (await readJson(`broadcasts/${zaalDag(now)}.json`, {})) || {};
    for (const e of Object.values(store)) {
      if (e && !e.stopped && e.tournamentId != null) streamToernooi[Number(e.tableNumber)] = e.tournamentId;
    }
  } catch (e) {
    context.warn(`[liveMatches] broadcast-store niet leesbaar (${e.message}) → podium zonder stream-controle.`);
  }
  const podiumTafels = podiumPerTafel(tournaments, cameras, streamToernooi);
  // toernooien = id + naam + status van wat onze backend als "vandaag" ziet (organisatiepagina).
  // De publieke Mokum Live-pagina kreeg zijn lijst uit Cuescore's venue/events, en daar ontbrak
  // het lopende toernooi (04-10: Mokum Multiball 2) terwijl oude leagues er wél in stonden.
  const toernooien = tournaments.map((t) => ({ id: t.id, name: t.name || '', status: t.status || '' }));
  // competitie = de teamwedstrijden van vandaag bij Mokum (v0.73), zodat Mokum Live ze naast de toernooien
  // kan tonen. getWedstrijdenVandaag is 10 min. gecachet, dus dit belast de competitie-API nauwelijks. Mislukt
  // het, dan laten we de vorige lijst staan (zoals bij Cuescore hierboven) i.p.v. de kaart te laten verdwijnen.
  let competitie;
  try {
    competitie = competitieVoorLive((await getWedstrijdenVandaag({ now })).wedstrijden);
  } catch (e) {
    context.warn(`[liveMatches] competitie-wedstrijden niet op te halen (${e.message}) → vorige lijst behouden.`);
    const vorig = (await readJson('live-matches.json', {})) || {};
    competitie = Array.isArray(vorig.competitie) ? vorig.competitie : [];
  }
  // `updatedAt` buiten de vergelijking, anders verschilt er per definitie elke ronde iets
  // en schrijven we alsnog elke minuut. Tussen twee wedstrijden in verandert er soms een
  // half uur niets — dan hoeft er ook niets naar de opslag (#101).
  const geschreven = await writeJsonAlsGewijzigd(
    'live-matches.json',
    { updatedAt: now.toISOString(), matches, venueLive, venueTables, podium, podiumPerTafel: podiumTafels, toernooien, competitie },
    { negeer: ['updatedAt'] },
  );
  const live = Object.values(matches).filter((m) => m && m.status === 'playing').length;
  if (geschreven) context.log(`[liveMatches] bijgewerkt — ${live}/${cameras.length} tafels live · ${venueLive} in de zaal`);
}

app.timer('liveMatches', {
  schedule: CRON_ELKE_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
