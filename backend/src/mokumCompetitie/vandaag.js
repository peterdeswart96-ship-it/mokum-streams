// Pure logica voor de dashboardbalk "Competitie thuiswedstrijden vandaag" (api-contract v0.72):
// uit de wedstrijden bij Mokum de wedstrijden van vandaag houden en de details van de
// mokum-competitie-API (spelers, aanvoerder) in een compacte vorm zetten. Géén netwerk → testbaar.

const { zaalDag } = require('../schedule/schedule');
const { toernooiVoorNiveau } = require('./toernooien');

const AGENDA_BASIS = 'https://mokum-competitie.pdscloud.nl/#/wedstrijd';

// Alleen wedstrijden die op de huidige zaal-dag beginnen (een nacht-wedstrijd telt nog voor
// de dag ervoor, zie zaalDag). Zonder geldige starttijd kunnen we het niet beoordelen: weglaten.
function vandaagUitLijst(wedstrijden, now = new Date()) {
  const vandaag = zaalDag(now);
  return (wedstrijden || []).filter((w) => {
    const t = new Date(w.starttime);
    return !Number.isNaN(t.getTime()) && zaalDag(t) === vandaag;
  });
}

// Eén team uit het detail-antwoord: naam + aanvoerder + spelerslijst (namen).
function vormTeam(team) {
  if (!team) return null;
  const roster = team.roster || {};
  const spelers = (roster.members || []).map((p) => p && p.name).filter(Boolean);
  const aanvoerder = (roster.captain && roster.captain.name) || null;
  return { name: team.name || '', aanvoerder, spelers };
}

// Voegt de details toe aan de wedstrijd. `detail` mag null zijn (ophalen mislukt): dan
// blijft de wedstrijd staan, met home/away null.
function metDetails(wedstrijd, detail) {
  const slug = wedstrijd.teams && wedstrijd.teams[0] && wedstrijd.teams[0].teamSlug;
  return {
    matchId: wedstrijd.matchId,
    matchUrl: wedstrijd.matchUrl,
    starttime: wedstrijd.starttime,
    roundName: wedstrijd.roundName,
    matchStatus: wedstrijd.matchStatus,
    niveau: wedstrijd.niveau,
    thuisteam: wedstrijd.thuisteam,
    uitteam: wedstrijd.uitteam,
    competitionName: (detail && detail.competitionName) || null,
    venueName: (detail && detail.venueName) || null,
    venueAddress: (detail && detail.venueAddress) || null,
    agendaUrl: slug ? `${AGENDA_BASIS}/${encodeURIComponent(slug)}/${wedstrijd.matchId}` : null,
    home: vormTeam(detail && detail.home),
    away: vormTeam(detail && detail.away),
  };
}

// Compacte lijst voor de publieke Mokum Live-pagina (v0.73): per wedstrijd net genoeg om de stand bij
// Cuescore op te zoeken (toernooiId + matchId). Een niveau zonder bekend Cuescore-toernooi valt af: daar
// is geen stand te lezen, dus ook niets te tonen.
function competitieVoorLive(wedstrijden) {
  const uit = [];
  for (const w of wedstrijden || []) {
    const toernooiId = toernooiVoorNiveau(w.niveau);
    if (!toernooiId || w.matchId == null) continue;
    uit.push({
      matchId: Number(w.matchId),
      niveau: w.niveau,
      toernooiId,
      thuisteam: w.thuisteam || '',
      uitteam: w.uitteam || '',
      starttime: w.starttime || null,
    });
  }
  return uit;
}

module.exports = { vandaagUitLijst, vormTeam, metDetails, competitieVoorLive, AGENDA_BASIS };

// Kleine geheugencache voor het antwoord van de dashboardbalk. Meerdere open tabbladen (of een
// snelle ververs) starten zo niet telkens ~20 aanroepen bij de competitie-API. Per instantie en
// bewust simpel: een fout wordt niet bewaard, en een nieuwe zaal-dag begint altijd met een
// schone lei (`sleutel`). `nu` en `ophalen` worden meegegeven, zodat dit zonder klok te testen is.
function maakCache(ttlMs) {
  let bewaard = null; // { sleutel, tot, waarde }
  return async function metCache(sleutel, nu, ophalen) {
    if (bewaard && bewaard.sleutel === sleutel && nu.getTime() < bewaard.tot) return bewaard.waarde;
    const waarde = await ophalen();
    bewaard = { sleutel, tot: nu.getTime() + ttlMs, waarde };
    return waarde;
  };
}

module.exports.maakCache = maakCache;
