// Finaliseert één afgelopen video (#56): zet er onze eigen thumbnail + een beschrijving
// met hoofdstukken op. Slaat VÓÓR elke wijziging het origineel (beschrijving + thumbnail)
// op als backup, zodat herstelVideo() alles exact kan terugzetten (reversibel).
//
// Werkt voor een toernooivideo (met Cuescore-data → hoofdstukken + spelersnamen) en voor
// een losse challenge (spelerA/spelerB, geen hoofdstukken).

const { readJson, writeJson } = require('../storage/blob');
const yt = require('../youtube/videos');
const { getTournament } = require('../cuescore');
const { bouwHoofdstukken, datumNL } = require('./hoofdstukken');
const { spelsoortVanDiscipline, sponsorVanNaam, schoneTitel } = require('./detectie');
const { genereerThumbnail } = require('./thumbnail');

const BACKUP = (videoId) => `finalize-backup/${videoId}.json`;
const INDEX = (videoId) => `video-index/${videoId}.json`; // per-wedstrijd-data voor #59

// Unieke spelersnamen op een tafel (in speelvolgorde), voor de thumbnail.
function uniekeSpelersOpTafel(tournament, tableNumber) {
  const tafel = String(tableNumber);
  const seen = [];
  const rijen = ((tournament && tournament.matches) || [])
    .filter((m) => m.table === tafel)
    .slice()
    .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  for (const m of rijen) {
    for (const p of [m.playerA, m.playerB]) {
      if (p && p.name && !seen.includes(p.name)) seen.push(p.name);
    }
  }
  return seen;
}

// Slaat het origineel op (idempotent: overschrijft een bestaande backup niet).
async function maakBackup(video) {
  const bestaand = await readJson(BACKUP(video.id), null);
  if (bestaand) return bestaand;
  let thumbnailBase64 = null, thumbnailMime = null;
  const url = yt.besteThumbnailUrl(video.thumbnails);
  if (url) {
    try { const t = await yt.downloadThumbnail(url); thumbnailBase64 = t.buffer.toString('base64'); thumbnailMime = t.mime; }
    catch { /* thumbnail niet te downloaden → beschrijving is toch al gebackupt */ }
  }
  const backup = {
    videoId: video.id, savedAt: new Date().toISOString(),
    title: video.title, categoryId: video.categoryId, description: video.description,
    thumbnailBase64, thumbnailMime,
  };
  await writeJson(BACKUP(video.id), backup);
  return backup;
}

// Finaliseert een toernooivideo.
async function finaliseerToernooi({ videoId, tournamentId, tableNumber }, opts = {}) {
  const video = await yt.getVideoDetails(videoId);
  if (!video) throw new Error(`video ${videoId} niet gevonden`);
  await maakBackup(video);

  const streamStart = opts.streamStartISO || video.actualStartTime;
  if (!streamStart) throw new Error(`geen streamstart (actualStartTime) voor ${videoId}`);

  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error(`toernooi ${tournamentId} niet gevonden`);

  const naamRaw = tournament.name || '';
  const sponsor = sponsorVanNaam(naamRaw);
  const spelers = uniekeSpelersOpTafel(tournament, tableNumber);

  const { beschrijving, hoofdstukken } = bouwHoofdstukken(streamStart, tournament, tableNumber);

  const png = await genereerThumbnail({
    type: 'toernooi',
    naam: sponsor ? schoneTitel(naamRaw) : naamRaw,
    spelsoort: spelsoortVanDiscipline(tournament.discipline, naamRaw),
    sponsor,
    spelers,
    tafel: tableNumber,
    datumLabel: datumNL(streamStart),
  });

  await yt.updateSnippetDescription(video, beschrijving);
  await yt.setThumbnail(videoId, png, 'image/png');

  // Per-wedstrijd-data bewaren voor de spelers-index (#59).
  await writeJson(INDEX(videoId), {
    videoId, tournamentId, tableNumber, tournamentName: naamRaw,
    datum: (streamStart || '').slice(0, 10), finalizedAt: new Date().toISOString(),
    hoofdstukken: hoofdstukken.filter((h) => h.spelers.length).map((h) => ({ offsetSec: h.offsetSec, spelers: h.spelers })),
  });

  return { videoId, type: 'toernooi', aantalHoofdstukken: hoofdstukken.length, spelers: spelers.length, thumbnailBytes: png.length };
}

// Finaliseert een losse challenge (geen Cuescore-data → geen hoofdstukken).
async function finaliseerChallenge({ videoId, spelerA, spelerB, tableNumber, spelsoort, datumISO }, opts = {}) {
  const video = await yt.getVideoDetails(videoId);
  if (!video) throw new Error(`video ${videoId} niet gevonden`);
  await maakBackup(video);
  const datum = datumISO || opts.streamStartISO || video.actualStartTime || video.scheduledStartTime;

  const png = await genereerThumbnail({
    type: 'challenge', spelerA, spelerB, spelsoort: spelsoort || null,
    tafel: tableNumber, datumLabel: datumNL(datum),
  });
  const beschrijving = [
    `Challenge match — ${spelerA || '?'} vs ${spelerB || '?'} — Tafel ${tableNumber} — ${datumNL(datum)}`,
    '', 'Mokum Pool & Darts',
  ].join('\n');

  await yt.updateSnippetDescription(video, beschrijving);
  await yt.setThumbnail(videoId, png, 'image/png');
  return { videoId, type: 'challenge', thumbnailBytes: png.length };
}

// Zet de video exact terug naar het origineel (undo).
async function herstelVideo(videoId) {
  const b = await readJson(BACKUP(videoId), null);
  if (!b) throw new Error(`geen backup voor ${videoId}`);
  await yt.updateSnippetDescription({ id: videoId, title: b.title, categoryId: b.categoryId, tags: null }, b.description);
  if (b.thumbnailBase64) {
    await yt.setThumbnail(videoId, Buffer.from(b.thumbnailBase64, 'base64'), b.thumbnailMime || 'image/jpeg');
  }
  return { videoId, restored: true, thumbnailHersteld: !!b.thumbnailBase64 };
}

module.exports = { finaliseerToernooi, finaliseerChallenge, herstelVideo, uniekeSpelersOpTafel };
