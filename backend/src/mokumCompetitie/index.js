// Leeslaag voor het mokum-competitie-project (mokum-competitie.pdscloud.nl): de
// curated lijst van Mokum-teams over alle niveaus (Eerste/Tweede/Derde Klasse,
// Eredivisie, Divisies) en hun aankomende wedstrijdschema, voor stream-planning
// vooraf. Publieke, anonieme API — geen key nodig.
//
// Dit is aanvullend op, en losstaand van, ../cuescore (dat blijft de bron voor
// live wedstrijden tijdens een uitzending: welke tafel nu speelt, wanneer een
// toernooi eindigt, etc.). mokum-competitie kent specifiek per team welk
// cuescore-toernooi erbij hoort — iets wat ../cuescore niet bijhoudt, omdat het
// op toernooi- en tafelniveau werkt, niet op team-niveau.

const API_BASE = process.env.MOKUM_COMPETITIE_API_URL || 'https://func-mokum-competitie.azurewebsites.net/api';
const TIMEOUT_MS = 10000;

// Alle Mokum-teams (elk team komt uit teams.json in het mokum-competitie-project,
// dus dit lijstje moet daar bijgewerkt worden als er een team bijkomt — niet hier).
async function getMokumTeams() {
  const res = await fetch(`${API_BASE}/teams`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`mokum-competitie /teams gaf ${res.status}`);
  return res.json();
}

// Aankomende wedstrijden van één team (teamSlug uit getMokumTeams()). Al
// gededupliceerd/gecachet aan de mokum-competitie-kant (elk uur ververst), dus dit
// belast cuescore zelf niet opnieuw.
async function getUpcomingMatchesForTeam(teamSlug) {
  const res = await fetch(`${API_BASE}/wedstrijden/${encodeURIComponent(teamSlug)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`mokum-competitie /wedstrijden/${teamSlug} gaf ${res.status}`);
  return res.json();
}

// Aankomende wedstrijden van ALLE Mokum-teams samen, gededupliceerd op matchId (een
// wedstrijd tussen twee Mokum-teams onderling staat anders dubbel in de lijst — één
// keer per team). Handig als startpunt voor een planningsoverzicht.
async function getAllUpcomingMokumMatches() {
  const teams = await getMokumTeams();
  const perTeam = await Promise.all(
    teams.map((team) =>
      getUpcomingMatchesForTeam(team.teamSlug)
        .then((matches) => matches.map((m) => ({ ...m, team })))
        .catch(() => [])
    )
  );

  const gezien = new Map();
  for (const matches of perTeam) {
    for (const match of matches) {
      if (!gezien.has(match.matchId)) gezien.set(match.matchId, match);
    }
  }
  return [...gezien.values()].sort((a, b) => new Date(a.starttime) - new Date(b.starttime));
}

module.exports = { getMokumTeams, getUpcomingMatchesForTeam, getAllUpcomingMokumMatches };
