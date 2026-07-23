// Pure logica voor het wedstrijd-archief (#59/#67): elke wedstrijd die we gefilmd hebben,
// met een deep-link naar het exacte moment in de video. Voedt zowel de zoekmachine op de
// Mokum Live-pagina als het run-out-overzicht (dat is simpelweg een filter hierop).
// Géén netwerk/opslag → volledig unit-testbaar.
//
// Waarom deep-links en geen clips: YouTube kent geen clip- of timestamp-playlists
// (startAt/endAt zijn afgeschaft). Knippen + her-uploaden kost 1.600 quota-eenheden per
// clip. Besluit 22-07 (#67): fase 1 = links naar het moment in de bestaande video.
//
// Koppeling video ↔ wedstrijd gaat via het SPELERSPAAR uit de hoofdstukken die bij het
// finaliseren zijn weggeschreven (`video-index/<videoId>.json`); die bevatten al de offset
// in seconden t.o.v. het begin van de stream. Zo werkt dit ook voor video's die al
// gefinaliseerd waren vóór dit issue — de index hoeft niet herschreven te worden.

// Spelers als vergelijkbare sleutel (volgorde-onafhankelijk, hoofdletter-ongevoelig).
function spelersSleutel(namen) {
  return (namen || [])
    .map((n) => String(n || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

const YT_URL = (videoId, offsetSec) => `https://youtu.be/${videoId}?t=${Math.max(0, offsetSec | 0)}`;

// Bouwt de archiefregels van één video. `indexRecord` = video-index/<id>.json,
// `tournament` = genormaliseerd Cuescore-toernooi. Retour: array (kan leeg zijn).
function wedstrijdenVoorVideo(indexRecord, tournament) {
  const rec = indexRecord || {};
  if (!rec.videoId) return [];
  const tafel = String(rec.tableNumber);

  // Offset per spelerspaar uit de al bewaarde hoofdstukken.
  const offsetPerPaar = new Map();
  for (const h of rec.hoofdstukken || []) {
    const sleutel = spelersSleutel(h && h.spelers);
    // Eerste voorkomen wint (een paar speelt zelden twee keer op dezelfde tafel).
    if (sleutel && !offsetPerPaar.has(sleutel)) offsetPerPaar.set(sleutel, h.offsetSec);
  }

  const uit = [];
  for (const m of (tournament && tournament.matches) || []) {
    if (!m || String(m.table) !== tafel) continue;
    const a = (m.playerA && m.playerA.name) || null;
    const b = (m.playerB && m.playerB.name) || null;
    const offset = offsetPerPaar.get(spelersSleutel([a, b]));
    if (offset == null) continue; // wedstrijd zit niet in deze video

    // Run-outs per speler (#67): allebei in één wedstrijd is mogelijk.
    const runouts = [];
    if (a && Number(m.runoutsA) > 0) runouts.push({ speler: a, aantal: Number(m.runoutsA) });
    if (b && Number(m.runoutsB) > 0) runouts.push({ speler: b, aantal: Number(m.runoutsB) });

    uit.push({
      videoId: rec.videoId,
      url: YT_URL(rec.videoId, offset),
      offsetSec: offset,
      datum: rec.datum || null,
      tafel: Number(rec.tableNumber),
      toernooi: rec.tournamentName || (tournament && tournament.name) || '',
      tournamentId: rec.tournamentId != null ? rec.tournamentId : (tournament && tournament.id) || null,
      ronde: m.roundName || null,
      spelers: [a, b].filter(Boolean),
      score: [m.scoreA == null ? null : Number(m.scoreA), m.scoreB == null ? null : Number(m.scoreB)],
      runouts,
    });
  }
  return uit;
}

// Vervangt de regels van één video in de bestaande lijst (idempotent bij opnieuw
// finaliseren) en sorteert: nieuwste datum eerst, binnen een video op offset.
function mergeWedstrijden(bestaand, videoId, nieuw) {
  const rest = (bestaand || []).filter((r) => r && r.videoId !== videoId);
  return sorteerWedstrijden([...rest, ...(nieuw || [])]);
}

function sorteerWedstrijden(lijst) {
  return [...(lijst || [])].sort((x, y) => {
    const d = String(y.datum || '').localeCompare(String(x.datum || '')); // nieuwste eerst
    if (d !== 0) return d;
    if (x.videoId !== y.videoId) return String(x.videoId).localeCompare(String(y.videoId));
    return (x.offsetSec || 0) - (y.offsetSec || 0);
  });
}

// Run-out-overzicht (#67): één regel per speler-met-run-out, nieuwste eerst.
function runoutsUitArchief(lijst) {
  const uit = [];
  for (const r of lijst || []) {
    for (const ro of (r && r.runouts) || []) {
      const tegen = (r.spelers || []).find((s) => s !== ro.speler) || null;
      uit.push({
        videoId: r.videoId, url: r.url, offsetSec: r.offsetSec,
        speler: ro.speler, aantal: ro.aantal, tegenstander: tegen,
        ronde: r.ronde, tafel: r.tafel, toernooi: r.toernooi,
        tournamentId: r.tournamentId, datum: r.datum,
      });
    }
  }
  return uit;
}

module.exports = {
  wedstrijdenVoorVideo,
  mergeWedstrijden,
  sorteerWedstrijden,
  runoutsUitArchief,
  spelersSleutel,
};
