const { app } = require('@azure/functions');
const { isAdmin } = require('../admin/auth');
const { getContainerClient } = require('../storage/blob');
const { listUploadVideoIds, getVideosDetails } = require('../youtube/videos');
const { templateVoorToernooi, TEMPLATE_TEKST } = require('../video/detectie');

// GET /api/manage/inventory — inventarisatie van alle kanaal-video's (#66). Admin-beveiligd.
// Per video: heeft-onze-thumbnail?, heeft-hoofdstukken?, titel, duur, datum, voorgestelde
// nieuwe naam, en categorie (challenge/toernooi/overig). Read-only.

const json = (status, body) => ({ status, jsonBody: body });

// Verzamelt de video-id's waarvoor een blob onder `prefix` bestaat (bestandsnaam = <id>.json).
async function blobIdSet(prefix) {
  const c = await getContainerClient();
  const set = new Set();
  for await (const b of c.listBlobsFlat({ prefix })) {
    const id = b.name.slice(prefix.length).replace(/\.json$/, '');
    if (id) set.add(id);
  }
  return set;
}

// ISO 8601-duur (PT#H#M#S) → seconden.
function durSec(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function categorie(title) {
  const t = String(title || '').toLowerCase();
  if (/\bchallenge\b|\bvs\.?\b/.test(t)) return 'challenge';
  if (templateVoorToernooi(title)) return 'toernooi';
  return 'overig';
}

// Voorgestelde nette naam: voor een toernooi de canonieke titel (+ behoud "Tafel N" en #nummer).
function nieuweNaam(title) {
  const key = templateVoorToernooi(title);
  if (key && TEMPLATE_TEKST[key] && TEMPLATE_TEKST[key].titel) {
    const tafel = (String(title).match(/tafel\s*\d+/i) || [])[0] || '';
    const nr = (String(title).match(/#\s*\d+/) || [])[0] || '';
    return [tafel, TEMPLATE_TEKST[key].titel, nr].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
  }
  return '';
}

app.http('adminInventory', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/inventory',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    try {
      const ids = await listUploadVideoIds();
      const details = await getVideosDetails(ids);
      const metThumb = await blobIdSet('finalize-backup/'); // wij zetten een thumbnail = er is een backup
      const metChapters = await blobIdSet('video-index/');   // toernooi-finalize schrijft de hoofdstuk-index

      const rows = details.map((v) => ({
        videoId: v.id,
        thumbnail: metThumb.has(v.id),
        hoofdstukken: metChapters.has(v.id),
        naam: v.title,
        durationSec: durSec(v.duration),
        datum: (v.actualStartTime || v.publishedAt || '').slice(0, 10),
        nieuweNaam: nieuweNaam(v.title),
        categorie: categorie(v.title),
      }));

      // Sorteer op datum (nieuwste eerst).
      rows.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));

      const perCat = rows.reduce((acc, r) => { acc[r.categorie] = (acc[r.categorie] || 0) + 1; return acc; }, {});
      return json(200, {
        aantal: rows.length,
        metThumbnail: rows.filter((r) => r.thumbnail).length,
        metHoofdstukken: rows.filter((r) => r.hoofdstukken).length,
        perCategorie: perCat,
        rows,
      });
    } catch (e) {
      context.log(`[inventory] fout: ${e.message}`);
      return json(500, { error: e.message });
    }
  },
});
