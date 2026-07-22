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
const { spelsoortVanDiscipline, sponsorVanNaam, schoneTitel, templateVoorToernooi, TEMPLATE_TEKST, datumThumb } = require('./detectie');
const { genereerThumbnail } = require('./thumbnail');            // fallback (canvas)
const { renderThumbnail, heeftTemplate } = require('./thumbnailHtml'); // per-toernooi HTML-ontwerp

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

// Kiest de per-toernooi HTML-template en rendert die naar een PNG. Valt terug op de
// generieke canvas-thumbnail als er geen passende template is (onbekend toernooi).
async function maakToernooiThumbnail({ naamRaw, sponsor, spelers, tableNumber, streamStart, discipline }) {
  const templateKey = templateVoorToernooi(naamRaw);
  if (heeftTemplate(templateKey)) {
    const extra = TEMPLATE_TEKST[templateKey] || {};
    // Vaste nette titel per template; anders de (van sponsor ontdane) Cuescore-naam.
    const titel = extra.titel || (sponsor ? schoneTitel(naamRaw) : naamRaw);
    return renderThumbnail({ templateKey, toernooinaam: titel, datum: datumThumb(streamStart), sponsor: extra.sponsor || '' });
  }
  return genereerThumbnail({
    type: 'toernooi',
    naam: sponsor ? schoneTitel(naamRaw) : naamRaw,
    spelsoort: spelsoortVanDiscipline(discipline, naamRaw),
    sponsor, spelers, tafel: tableNumber, datumLabel: datumNL(streamStart),
  });
}

// Challenge-thumbnail: het VS-ontwerp (challenge-match.html), met canvas-fallback.
async function maakChallengeThumbnail({ spelerA, spelerB, spelsoort, tableNumber, datum }) {
  if (heeftTemplate('challenge-match')) {
    return renderThumbnail({
      templateKey: 'challenge-match', toernooinaam: 'Challenge',
      spelers: `${spelerA || '?'}, ${spelerB || '?'}`, datum: datumThumb(datum),
    });
  }
  return genereerThumbnail({ type: 'challenge', spelerA, spelerB, spelsoort: spelsoort || null, tafel: tableNumber, datumLabel: datumNL(datum) });
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

// Finaliseert een toernooivideo. Met alleenHoofdstukken=true wordt ALLEEN de beschrijving
// (hoofdstukken) gezet, zonder de thumbnail — handig voor bulk-hoofdstukken zonder tegen
// YouTube's thumbnail-upload-limiet te lopen (#66).
async function finaliseerToernooi({ videoId, tournamentId, tableNumber, alleenHoofdstukken }, opts = {}) {
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

  await yt.updateSnippetDescription(video, beschrijving);
  let thumbnailBytes = 0;
  if (!alleenHoofdstukken) {
    const png = await maakToernooiThumbnail({
      naamRaw, sponsor, spelers, tableNumber, streamStart, discipline: tournament.discipline,
    });
    await yt.setThumbnail(videoId, png, 'image/png');
    thumbnailBytes = png.length;
  }

  // Per-wedstrijd-data bewaren voor de spelers-index (#59).
  await writeJson(INDEX(videoId), {
    videoId, tournamentId, tableNumber, tournamentName: naamRaw,
    datum: (streamStart || '').slice(0, 10), finalizedAt: new Date().toISOString(),
    hoofdstukken: hoofdstukken.filter((h) => h.spelers.length).map((h) => ({ offsetSec: h.offsetSec, spelers: h.spelers })),
  });

  return { videoId, type: 'toernooi', aantalHoofdstukken: hoofdstukken.length, spelers: spelers.length, thumbnailBytes };
}

// Finaliseert een losse challenge (geen Cuescore-data → geen hoofdstukken).
async function finaliseerChallenge({ videoId, spelerA, spelerB, tableNumber, spelsoort, datumISO }, opts = {}) {
  const video = await yt.getVideoDetails(videoId);
  if (!video) throw new Error(`video ${videoId} niet gevonden`);
  await maakBackup(video);
  const datum = datumISO || opts.streamStartISO || video.actualStartTime || video.scheduledStartTime;

  const png = await maakChallengeThumbnail({ spelerA, spelerB, spelsoort, tableNumber, datum });
  const beschrijving = [
    `Challenge match — ${spelerA || '?'} vs ${spelerB || '?'} — Tafel ${tableNumber} — ${datumNL(datum)}`,
    '', 'Mokum Pool & Darts',
  ].join('\n');

  await yt.updateSnippetDescription(video, beschrijving);
  await yt.setThumbnail(videoId, png, 'image/png');
  return { videoId, type: 'challenge', thumbnailBytes: png.length };
}

// Zet ALLEEN onze thumbnail op een video (geen hoofdstukken/beschrijving), op basis van de
// toernooinaam — voor video's zonder Cuescore-tournamentId (#62). Maakt eerst een backup, dus
// herstelVideo() zet 'm terug. Kies expliciet een templateKey, of laat 'm uit de naam afleiden.
async function finaliseerAlleenThumbnail({ videoId, tournamentName, templateKey, datumISO }, opts = {}) {
  const video = await yt.getVideoDetails(videoId);
  if (!video) throw new Error(`video ${videoId} niet gevonden`);
  const key = templateKey || templateVoorToernooi(tournamentName);
  if (!heeftTemplate(key)) throw new Error(`geen template voor "${tournamentName || ''}"`);
  await maakBackup(video);

  const datum = datumISO || opts.streamStartISO || video.actualStartTime || video.scheduledStartTime;
  const extra = TEMPLATE_TEKST[key] || {};
  const titel = extra.titel || (sponsorVanNaam(tournamentName) ? schoneTitel(tournamentName) : tournamentName);
  const png = await renderThumbnail({ templateKey: key, toernooinaam: titel, datum: datumThumb(datum), sponsor: extra.sponsor || '' });

  await yt.setThumbnail(videoId, png, 'image/png');
  return { videoId, type: 'thumbnail', template: key, thumbnailBytes: png.length };
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

module.exports = { finaliseerToernooi, finaliseerChallenge, finaliseerAlleenThumbnail, herstelVideo, uniekeSpelersOpTafel };
