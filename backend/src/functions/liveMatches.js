const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { getTodaysTournaments } = require('../cuescore');
const { bouwLiveMatches } = require('../planning/pauze');

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
  await writeJson('live-matches.json', { updatedAt: now.toISOString(), matches });
  const live = Object.values(matches).filter((m) => m && m.status === 'playing').length;
  context.log(`[liveMatches] bijgewerkt — ${live}/${cameras.length} tafels live`);
}

app.timer('liveMatches', {
  schedule: CRON_ELKE_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
