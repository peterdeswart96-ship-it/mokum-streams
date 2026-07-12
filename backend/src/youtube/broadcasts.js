const { getYouTubeClient } = require('./client');

// Wrapper rond de YouTube Live Streaming API (liveStreams + liveBroadcasts).
// Dit is de kern van de automatisering: per tafel één herbruikbare stream key,
// per uitzending een broadcast met autoStart/autoStop. Zie wiki/architecture.md.

// --- Pure hulpfunctie (geen netwerk → unit-testbaar) --------------------------

// Bouwt de broadcast-titel volgens het vaste template:
//   Tafel {nr} '{sponsor}' {toernooinaam}
// Zonder sponsor laten we de quotes weg (dan is er niets om te tonen).
function buildBroadcastTitle({ tafel, sponsor, toernooinaam }) {
  if (tafel === undefined || tafel === null || tafel === '') {
    throw new Error('tafel is verplicht voor de broadcast-titel');
  }
  const naam = (toernooinaam || '').trim();
  const sp = (sponsor || '').trim();
  const sponsorDeel = sp ? ` '${sp}'` : '';
  return `Tafel ${tafel}${sponsorDeel} ${naam}`.trim();
}

// --- API-aanroepen ------------------------------------------------------------

// Lijst van bestaande liveStreams van het kanaal (voor idempotente seed).
// Retour: [{ id, title }]. De stream key (streamName) laten we hier bewust weg.
async function listLiveStreams() {
  const yt = await getYouTubeClient();
  const res = await yt.liveStreams.list({ part: ['id', 'snippet'], mine: true, maxResults: 50 });
  return (res.data.items || []).map((s) => ({ id: s.id, title: (s.snippet && s.snippet.title) || '' }));
}

// Maakt een herbruikbare liveStream (vaste stream key) aan. Per tafel doen we
// dit één keer; OBS wordt met de key geconfigureerd en we hergebruiken het
// streamId voor elke nieuwe broadcast.
// LET OP: het teruggegeven object bevat cdn.ingestionInfo.streamName = de stream
// key. Dat is een secret; nooit loggen of in de repo zetten.
async function createReusableLiveStream({ title }) {
  const yt = await getYouTubeClient();
  const res = await yt.liveStreams.insert({
    part: ['snippet', 'cdn', 'contentDetails'],
    requestBody: {
      snippet: { title },
      cdn: { frameRate: 'variable', ingestionType: 'rtmp', resolution: 'variable' },
      contentDetails: { isReusable: true },
    },
  });
  return res.data; // { id, cdn: { ingestionInfo: { streamName, ingestionAddress } }, ... }
}

// Maakt een broadcast (uitzending) aan met autoStart/autoStop, zodat YouTube
// vanzelf live gaat zodra OBS beeld stuurt en vanzelf stopt als OBS ophoudt.
async function createBroadcast({
  title,
  description = '',
  scheduledStartTime,
  enableAutoStart = true,
  enableAutoStop = true,
  privacyStatus = 'public',
}) {
  if (!title) throw new Error('title is verplicht');
  if (!scheduledStartTime) throw new Error('scheduledStartTime is verplicht (ISO 8601)');

  const yt = await getYouTubeClient();
  const res = await yt.liveBroadcasts.insert({
    part: ['snippet', 'status', 'contentDetails'],
    requestBody: {
      snippet: { title, description, scheduledStartTime },
      status: { privacyStatus, selfDeclaredMadeForKids: false },
      // enableEmbed: insluiten op de website toestaan (nodig voor de live-pagina/widget).
      contentDetails: { enableAutoStart, enableAutoStop, enableEmbed: true },
    },
  });
  return res.data; // { id (= videoId), snippet, status, ... }
}

// Koppelt een broadcast aan de vaste stream key (liveStream) van een tafel.
async function bindBroadcast({ broadcastId, streamId }) {
  if (!broadcastId || !streamId) throw new Error('broadcastId en streamId zijn verplicht');
  const yt = await getYouTubeClient();
  const res = await yt.liveBroadcasts.bind({
    id: broadcastId,
    streamId,
    part: ['id', 'contentDetails'],
  });
  return res.data;
}

// Leest de lifecycle-status van een broadcast:
// created | ready | testing | live | complete | revoked.
async function getBroadcastStatus(broadcastId) {
  if (!broadcastId) throw new Error('broadcastId is verplicht');
  const yt = await getYouTubeClient();
  const res = await yt.liveBroadcasts.list({ id: [broadcastId], part: ['status', 'snippet'] });
  const item = res.data.items && res.data.items[0];
  return item ? item.status.lifeCycleStatus : null;
}

// Lijst van nu-actieve (live) broadcasts van het kanaal — read-only. Retour:
// [{ videoId, title }]. Gebruikt om per tafel het live YouTube-videoId te vinden,
// óók voor handmatig gestarte uitzendingen (mine=true = alle broadcasts op het kanaal).
async function listActiveBroadcasts() {
  const yt = await getYouTubeClient();
  // LET OP: liveBroadcasts.list eist PRECIES ÉÉN filter (id | mine | broadcastStatus).
  // `broadcastStatus: 'active'` is al kanaal-scoped (de geauthenticeerde eigenaar) →
  // `mine` mag er NIET bij (anders 'incompatibleParameters').
  const res = await yt.liveBroadcasts.list({
    part: ['id', 'snippet'],
    broadcastStatus: 'active',
    maxResults: 50,
  });
  return (res.data.items || []).map((b) => ({ videoId: b.id, title: (b.snippet && b.snippet.title) || '' }));
}

module.exports = {
  buildBroadcastTitle,
  listLiveStreams,
  createReusableLiveStream,
  createBroadcast,
  bindBroadcast,
  getBroadcastStatus,
  listActiveBroadcasts,
};
