const { app } = require('@azure/functions');
const { readJson, writeJsonAlsGewijzigd } = require('../storage/blob');
const { listActiveBroadcasts } = require('../youtube/broadcasts');
const { koppelVideosAanTafels } = require('../youtube/liveVideos');

// Timer-Function: vraagt periodiek de nu-actieve YouTube-broadcasts van het kanaal op
// (read-only) en koppelt ze per cameratafel op titel → live-videos.json. Voedt het
// `liveVideoId`-veld in GET /api/live zodat het dashboard de echte stream kan embedden,
// óók voor handmatig gestarte uitzendingen. Geen streams worden gemaakt/gestopt →
// veilig, ook tijdens een lopend toernooi. Fail-safe: bij een fout vorige stand behouden.

const CRON_ELKE_MIN_OFFSET = '20 */1 * * * *'; // elke minuut op sec 20 (niet botsen met andere timers)
const CAMERAS_DEFAULT = [1, 3, 15, 16];

async function verwerk(now, context) {
  const tables = (await readJson('config/tables.json', [])) || [];
  const cameras = tables.length ? tables.map((t) => Number(t.tableNumber)) : CAMERAS_DEFAULT;

  let broadcasts;
  try {
    broadcasts = await listActiveBroadcasts();
  } catch (e) {
    context.log(`[liveVideos] YouTube niet bereikbaar (${e.message}) → vorige stand behouden.`);
    return;
  }

  const videos = koppelVideosAanTafels(broadcasts, cameras);
  // `updatedAt` buiten de vergelijking: dat verandert per definitie elke ronde, en dan zou
  // er alsnog elke minuut geschreven worden. Niets leest dit veld om te bepalen of de data
  // vers is, dus een tijdstempel die stilstaat als er niets gebeurt is geen probleem (#101).
  const geschreven = await writeJsonAlsGewijzigd(
    'live-videos.json', { updatedAt: now.toISOString(), videos }, { negeer: ['updatedAt'] },
  );
  if (geschreven) context.log(`[liveVideos] ${Object.keys(videos).length}/${cameras.length} tafels live op YouTube`);
}

app.timer('liveVideos', {
  schedule: CRON_ELKE_MIN_OFFSET,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
