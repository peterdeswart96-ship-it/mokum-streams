// De laatste vijf tegenstanders van een lid — pure logica, geen netwerk/opslag.
//
// Staat in het ledenrecord (niet in de browser), zodat dezelfde vijf op elk apparaat
// verschijnen. Alles komt van een webpagina, dus elk veld wordt opgeschoond.

const MAX_RECENT = 5;

const tekst = (v, max = 80) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s ? s.slice(0, max) : null;
};

// Eén speler opschonen. Retour: { playerId, naam, foto, land, club, plaats } of null.
function schoneSpeler(rauw) {
  if (!rauw || typeof rauw !== 'object') return null;
  const playerId = Number(rauw.playerId);
  if (!Number.isFinite(playerId) || playerId <= 0) return null;
  const foto = tekst(rauw.foto, 300);
  return {
    playerId,
    naam: tekst(rauw.naam, 60) || 'player',
    // Alleen http(s)-adressen: de foto wordt in een <img> getoond.
    foto: foto && /^https?:\/\//i.test(foto) ? foto : null,
    land: tekst(rauw.land),
    club: tekst(rauw.club),
    plaats: tekst(rauw.plaats),
  };
}

// Zet `speler` bovenaan; was hij al in de lijst, dan verhuist hij (geen dubbelen).
function onthoudSpeler(lijst, speler) {
  const nieuw = schoneSpeler(speler);
  if (!nieuw) return Array.isArray(lijst) ? lijst.slice(0, MAX_RECENT) : [];
  const rest = (Array.isArray(lijst) ? lijst : []).filter((s) => s && s.playerId !== nieuw.playerId);
  return [nieuw, ...rest].slice(0, MAX_RECENT);
}

module.exports = { MAX_RECENT, schoneSpeler, onthoudSpeler };
