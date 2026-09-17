// Zoekt een teamwedstrijd op via zijn matchId (#82, #145, v0.61). Nodig als de wizard het
// niveau en de teamnamen niet heeft meegestuurd — bijvoorbeeld omdat de browser nog een oude
// versie van het dashboard draaide (test 17-09). Zonder deze gegevens komt er anders stil
// geen thumbnail en geen automatische stop.

const { getTournament } = require('../cuescore');
const { TOERNOOI_PER_NIVEAU } = require('./toernooien');

// Puur: vindt de wedstrijd in een lijst opgehaalde toernooien. `toernooien` = [{ niveau, tournament }].
// In Cuescore is playerA altijd het thuisteam.
function vindWedstrijd(toernooien, matchId) {
  for (const { niveau, tournament } of toernooien || []) {
    const m = ((tournament && tournament.matches) || []).find((x) => String(x.matchId) === String(matchId));
    if (m) {
      return {
        niveau,
        thuisteam: (m.playerA && m.playerA.name) || '',
        uitteam: (m.playerB && m.playerB.name) || '',
        match: m,
      };
    }
  }
  return null;
}

// Netwerk: haalt de competitietoernooien één voor één op tot de wedstrijd gevonden is.
// Begint bij het niveau dat de entry eventueel al heeft. Retour: zie vindWedstrijd, of null.
async function zoekCompetitieWedstrijd(matchId, { niveau = null, haalToernooi = getTournament } = {}) {
  const volgorde = Object.entries(TOERNOOI_PER_NIVEAU)
    .sort(([a], [b]) => (a === niveau ? -1 : b === niveau ? 1 : 0));
  for (const [n, id] of volgorde) {
    let tournament = null;
    try { tournament = await haalToernooi(id); } catch { continue; } // volgende proberen
    const gevonden = vindWedstrijd([{ niveau: n, tournament }], matchId);
    if (gevonden) return gevonden;
  }
  return null;
}

// Heeft deze entry het niveau en beide teams al?
function heeftTeams(entry) {
  return !!(entry && entry.niveau && entry.thuisteam && entry.uitteam);
}

module.exports = { vindWedstrijd, zoekCompetitieWedstrijd, heeftTeams };
