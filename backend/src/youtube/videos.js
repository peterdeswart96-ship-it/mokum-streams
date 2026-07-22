// Wrapper rond de YouTube Data API v3 voor bestaande video's (#56, finaliseren):
// details ophalen, beschrijving updaten, thumbnail zetten, en de huidige thumbnail
// downloaden (voor de backup/undo). Gebruikt dezelfde OAuth-client als de broadcasts.

const { Readable } = require('stream');
const { getYouTubeClient } = require('./client');

// Haalt titel/beschrijving/categorie/thumbnails + het echte streambegin (actualStartTime) op.
async function getVideoDetails(videoId) {
  const yt = await getYouTubeClient();
  const res = await yt.videos.list({ id: [videoId], part: ['snippet', 'liveStreamingDetails'] });
  const v = res.data.items && res.data.items[0];
  if (!v) return null;
  const s = v.snippet || {};
  const lsd = v.liveStreamingDetails || {};
  return {
    id: v.id,
    title: s.title || '',
    description: s.description || '',
    categoryId: s.categoryId || '20',
    tags: Array.isArray(s.tags) ? s.tags : null,
    thumbnails: s.thumbnails || {},
    actualStartTime: lsd.actualStartTime || null,
    actualEndTime: lsd.actualEndTime || null,
    scheduledStartTime: lsd.scheduledStartTime || null,
  };
}

// Kiest de hoogst beschikbare thumbnail-URL (voor de backup).
function besteThumbnailUrl(thumbnails) {
  for (const k of ['maxres', 'standard', 'high', 'medium', 'default']) {
    if (thumbnails && thumbnails[k] && thumbnails[k].url) return thumbnails[k].url;
  }
  return null;
}

async function downloadThumbnail(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`thumbnail download mislukt (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mime: res.headers.get('content-type') || 'image/jpeg' };
}

// Zet de beschrijving. YouTube vereist bij een snippet-update dat titel + categoryId
// meegestuurd worden (anders worden die leeggemaakt) — dus die behouden we expliciet.
async function updateSnippetDescription(video, nieuweBeschrijving) {
  const yt = await getYouTubeClient();
  await yt.videos.update({
    part: ['snippet'],
    requestBody: {
      id: video.id,
      snippet: {
        title: video.title,
        categoryId: video.categoryId,
        description: nieuweBeschrijving,
        ...(video.tags ? { tags: video.tags } : {}),
      },
    },
  });
}

async function setThumbnail(videoId, buffer, mime = 'image/png') {
  const yt = await getYouTubeClient();
  await yt.thumbnails.set({ videoId, media: { mimeType: mime, body: Readable.from(buffer) } });
}

// Alle video-id's van het kanaal (de uploads-playlist), gepagineerd. Voor de inventarisatie (#66).
async function listUploadVideoIds() {
  const yt = await getYouTubeClient();
  const ch = await yt.channels.list({ part: ['contentDetails'], mine: true });
  const uploads = ch.data.items && ch.data.items[0]
    && ch.data.items[0].contentDetails
    && ch.data.items[0].contentDetails.relatedPlaylists
    && ch.data.items[0].contentDetails.relatedPlaylists.uploads;
  if (!uploads) throw new Error('geen uploads-playlist gevonden voor dit kanaal');

  const ids = [];
  let pageToken;
  do {
    const res = await yt.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    for (const it of res.data.items || []) {
      const id = it.contentDetails && it.contentDetails.videoId;
      if (id) ids.push(id);
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return ids;
}

// Details voor een lijst video-id's (batches van 50): titel, duur, live-tijden, publicatiedatum.
async function getVideosDetails(ids) {
  const yt = await getYouTubeClient();
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await yt.videos.list({
      part: ['snippet', 'contentDetails', 'liveStreamingDetails'],
      id: ids.slice(i, i + 50), maxResults: 50,
    });
    for (const v of res.data.items || []) {
      const s = v.snippet || {}, cd = v.contentDetails || {}, lsd = v.liveStreamingDetails || {};
      out.push({
        id: v.id,
        title: s.title || '',
        publishedAt: s.publishedAt || null,
        duration: cd.duration || null, // ISO 8601 (PT#H#M#S)
        actualStartTime: lsd.actualStartTime || null,
        actualEndTime: lsd.actualEndTime || null,
      });
    }
  }
  return out;
}

module.exports = { getVideoDetails, besteThumbnailUrl, downloadThumbnail, updateSnippetDescription, setThumbnail, listUploadVideoIds, getVideosDetails };
