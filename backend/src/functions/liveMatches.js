const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { getTodaysTournaments } = require('../cuescore');
const { bouwLiveMatches, telZaalLive, bouwZaalRaster } = require('../planning/pauze');
const { podiumVoorZaal } = require('../planning/podium');

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
    context.log(`[liveMatches] Cuescore niet bereikbaar (${e.message}) → vorige stand behouden.`);
    return;
  }

  const matches = bouwLiveMatches(tournaments, cameras);
  const venueLive = telZaalLive(tournaments);
  // venueTables = zaalbreed raster (alle tafels met een wedstrijd) voor het eigen
  // Mokum-tafelraster in het pauzescherm (#54).
  const venueTables = bouwZaalRaster(tournaments);
  // podium = medaillescherm van een net-afgerond toernooi (winnaar-moment #54); kijkt
  // alleen naar de cameratafels. null zolang een cameratafel nog speelt of geen finale
  // gespeeld is.
  const podium = podiumVoorZaal(tournaments, cameras);
  await writeJson('live-matches.json', { updatedAt: now.toISOString(), matches, venueLive, venueTables, podium });
  const live = Object.values(matches).filter((m) => m && m.status === 'playing').length;
  context.log(`[liveMatches] bijgewerkt — ${live}/${cameras.length} tafels live · ${venueLive} in de zaal`);
}

app.timer('liveMatches', {
  schedule: CRON_ELKE_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
