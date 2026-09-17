// Pure logica voor de competitie-wizard (#120): uit de wedstrijden per Mokum-team de
// lijst maken van teamwedstrijden die BIJ ONS gespeeld worden. Géén netwerk → testbaar.
//
// Twee keuzes uit het ontwerp (17-09):
//   - Filteren op `venueName`, NIET op `isHome`. Bij een wedstrijd tussen twee Mokum-teams
//     (Moko Loco vs. Mokum Sixpack) is één van beide per definitie `isHome: false`, terwijl
//     de wedstrijd gewoon hier is. De vraag is "wordt dit bij ons gespeeld?".
//   - Zo'n onderlinge wedstrijd komt twee keer binnen (één keer per team). Hij hoort één
//     keer in de lijst, met beide teams erbij, zodat je hem via allebei kunt vinden.

// Zo heet de zaal in Cuescore ("Mokum Pool & Darts"). Bewust niet alleen "mokum": dat
// woord zit ook in teamnamen, en die kunnen best eens een uitwedstrijd hebben.
const ZAAL = 'mokum pool';

const { zaalDag } = require('../schedule/schedule');

const bijMokum = (m) => String((m && m.venueName) || '').toLowerCase().includes(ZAAL);

// Periode "vanaf vandaag" (zaal-dag). De API filtert alleen op status, en een wedstrijd die in
// Cuescore nooit is afgesloten blijft dan dagen op "playing" staan (Mokumse mikmak van 14-09
// stond er op 17-09 nog in). Zonder starttijd kunnen we het niet beoordelen: dan laten we hem staan.
function nietVoorbij(m, now) {
  const t = new Date(m.starttime);
  if (Number.isNaN(t.getTime())) return true;
  return zaalDag(t) >= zaalDag(now);
}

// `perTeam`: [{ team, matches }] — team uit getMokumTeams(), matches uit
// getUpcomingMatchesForTeam(). Retour: gesorteerd op starttime.
function wedstrijdenBijMokum(perTeam, now = new Date()) {
  const perMatch = new Map();
  for (const { team, matches } of perTeam || []) {
    for (const m of matches || []) {
      if (!m || m.matchId == null || !bijMokum(m) || !nietVoorbij(m, now)) continue;
      const teamRef = { teamSlug: team.teamSlug, teamName: team.teamName };
      // In Cuescore is playerA altijd het thuisteam; `isHome` zegt of DIT team playerA is.
      const thuisteam = m.isHome ? team.teamName : m.opponent;
      const uitteam = m.isHome ? m.opponent : team.teamName;

      const bestaand = perMatch.get(m.matchId);
      if (bestaand) {
        bestaand.teams.push(teamRef);
        // Vanuit het thuisteam gezien kloppen beide namen zoals wij ze kennen (teams.json);
        // die heeft voorrang boven de Cuescore-naam van de tegenstander.
        if (m.isHome) bestaand.thuisteam = team.teamName;
        else bestaand.uitteam = team.teamName;
        continue;
      }
      perMatch.set(m.matchId, {
        matchId: m.matchId,
        matchUrl: m.matchUrl,
        starttime: m.starttime,
        roundName: m.roundName,
        matchStatus: m.matchStatus,
        niveauCategorie: team.niveauCategorie,
        niveau: team.niveau,
        thuisteam,
        uitteam,
        teams: [teamRef],
      });
    }
  }
  return [...perMatch.values()].sort((a, b) => String(a.starttime).localeCompare(String(b.starttime)));
}

// De titel zonder "Tafel {nr}" — die zet buildBroadcastTitle er zelf voor.
function competitieTitel(w) {
  return `${w.niveau} ${w.thuisteam} vs. ${w.uitteam}`;
}

module.exports = { wedstrijdenBijMokum, competitieTitel, bijMokum };
