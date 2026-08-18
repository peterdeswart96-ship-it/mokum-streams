// Bepaalt welke finalize-actie een gestopte broadcast-entry moet krijgen (#102): een
// toernooi (hoofdstukken + thumbnail), een challenge (alleen thumbnail + beschrijving,
// géén hoofdstukken — er is geen Cuescore-toernooidata om ze uit af te leiden), of geen
// van beide (nog niet klaar, of een ad-hoc stream zonder genoeg gegevens). Puur/testbaar
// — de netwerklaag (finalizeVideos.js) voert de gekozen actie zelf uit.

// Retour: 'toernooi' | 'challenge' | null.
function finaliseerActie(entry) {
  if (!entry || !entry.stopped || entry.finalized || entry.finalizeOpgegeven || !entry.videoId) return null;
  if (entry.tournamentId != null) return 'toernooi';
  // Een challenge zonder spelersnamen zou op de thumbnail "? VS ?" tonen — dat is
  // slechter dan de automatische YouTube-still, dus dan liever overslaan (blijft ad-hoc,
  // net als voorheen) dan zo'n thumbnail zetten.
  const heeftSpelers = !!(entry.spelerA || entry.spelerB);
  if (entry.streamType === 'challenge' && heeftSpelers) return 'challenge';
  return null;
}

module.exports = { finaliseerActie };
