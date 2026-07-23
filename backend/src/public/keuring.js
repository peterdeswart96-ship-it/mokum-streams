// Pure logica voor het keuren van highlight-clips (#71). Géén netwerk/opslag → testbaar.
//
// Niet elke run-out levert bruikbaar beeld op: soms staat het pauzescherm in beeld, staat
// de camera verkeerd, of gebeurt er buiten beeld iets. Daarom keurt Peter de clips vooraf,
// en speelt de uitzending alleen goedgekeurde fragmenten af.
//
// Sleutel per clip = videoId + het RACK-moment (offsetSec), bewust NIET de start van het
// clipvenster: dat venster kunnen we later bijstellen, en dan mag een oordeel niet
// verdampen. Het rack-moment ligt vast zolang de video en de wedstrijd hetzelfde zijn.

const GOED = 'goed';
const AFGEKEURD = 'afgekeurd';

function clipSleutel(clip) {
  if (!clip || !clip.videoId || clip.offsetSec == null) return null;
  return `${clip.videoId}:${clip.offsetSec}`;
}

// Alleen deze twee statussen slaan we op; alles anders betekent "nog niet gekeurd".
function normaliseerStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === GOED || s === AFGEKEURD ? s : null;
}

// Zet het oordeel en/of de eigen startseconde van één clip. `wijziging` mag een status zijn
// ('goed' | 'afgekeurd' | null) of een object { status?, start? }; wat je niet meestuurt
// blijft staan. Retour: een NIEUW object, het origineel blijft heel.
function zetKeuring(bestaand, sleutel, wijziging, nu) {
  const uit = { ...(bestaand || {}) };
  if (!sleutel) return uit;
  const patch = wijziging && typeof wijziging === 'object' ? wijziging : { status: wijziging };
  const huidig = uit[sleutel] || {};

  const status = 'status' in patch ? normaliseerStatus(patch.status) : normaliseerStatus(huidig.status);
  const ruweStart = 'start' in patch ? patch.start : huidig.start;
  const n = Number(ruweStart);
  const start = ruweStart != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;

  // Niets meer te onthouden → de regel weg (weer "nog niet gekeurd", standaard-venster).
  if (!status && start == null) { delete uit[sleutel]; return uit; }
  uit[sleutel] = { ...(status ? { status } : {}), ...(start != null ? { start } : {}), at: nu || null };
  return uit;
}

// Hangt het oordeel aan elke clip (`keuring`: 'goed' | 'afgekeurd' | null) plus de sleutel,
// zodat de keuringspagina er direct op kan bedienen.
function metKeuring(clips, keuring) {
  const k = keuring || {};
  return (clips || []).map((c) => {
    const sleutel = clipSleutel(c);
    const rec = sleutel ? k[sleutel] : null;
    // Eigen startseconde gaat vóór het standaard-venster, maar nooit voorbij het einde.
    const eigen = rec && rec.start != null ? Math.min(rec.start, (c.clipTot || 0) - 5) : null;
    return {
      ...c,
      sleutel,
      keuring: (rec && normaliseerStatus(rec.status)) || null,
      clipVan: eigen != null && eigen >= 0 ? eigen : c.clipVan,
      startAangepast: eigen != null && eigen >= 0,
    };
  });
}

// Wat de uitzending mag afspelen: alleen expliciet goedgekeurde clips.
function goedgekeurd(clips, keuring) {
  return metKeuring(clips, keuring).filter((c) => c.keuring === GOED);
}

function tel(clips, keuring) {
  const alle = metKeuring(clips, keuring);
  return {
    totaal: alle.length,
    goed: alle.filter((c) => c.keuring === GOED).length,
    afgekeurd: alle.filter((c) => c.keuring === AFGEKEURD).length,
    tekeuren: alle.filter((c) => c.keuring === null).length,
  };
}

module.exports = { clipSleutel, normaliseerStatus, zetKeuring, metKeuring, goedgekeurd, tel, GOED, AFGEKEURD };
