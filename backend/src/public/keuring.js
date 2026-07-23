// Pure logica voor het keuren van highlight-clips (#71). Géén netwerk/opslag → testbaar.
//
// Niet elke run-out levert bruikbaar beeld op: soms staat het pauzescherm in beeld, staat
// de camera verkeerd, of gebeurt er buiten beeld iets. Daarom keurt Peter de clips vooraf,
// en speelt de uitzending alleen goedgekeurde fragmenten af.
//
// Sleutel per clip = videoId + startseconde van het clipvenster. Die blijft gelijk zolang
// het rack en de video hetzelfde zijn, ook als het archief opnieuw wordt opgebouwd.

const GOED = 'goed';
const AFGEKEURD = 'afgekeurd';

function clipSleutel(clip) {
  if (!clip || !clip.videoId || clip.clipVan == null) return null;
  return `${clip.videoId}:${clip.clipVan}`;
}

// Alleen deze twee statussen slaan we op; alles anders betekent "nog niet gekeurd".
function normaliseerStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === GOED || s === AFGEKEURD ? s : null;
}

// Zet (of wist) het oordeel over één clip. Retour: een NIEUW object, het origineel blijft heel.
function zetKeuring(bestaand, sleutel, status, nu) {
  const uit = { ...(bestaand || {}) };
  const s = normaliseerStatus(status);
  if (!sleutel) return uit;
  if (!s) delete uit[sleutel];               // terug naar "nog niet gekeurd"
  else uit[sleutel] = { status: s, at: nu || null };
  return uit;
}

// Hangt het oordeel aan elke clip (`keuring`: 'goed' | 'afgekeurd' | null) plus de sleutel,
// zodat de keuringspagina er direct op kan bedienen.
function metKeuring(clips, keuring) {
  const k = keuring || {};
  return (clips || []).map((c) => {
    const sleutel = clipSleutel(c);
    const rec = sleutel ? k[sleutel] : null;
    return { ...c, sleutel, keuring: (rec && normaliseerStatus(rec.status)) || null };
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
