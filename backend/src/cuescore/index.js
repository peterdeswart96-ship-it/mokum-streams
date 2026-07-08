const {
  formatCuescoreDate,
  parseTodaysTournamentIds,
  normalizeTournament,
  findTableMatch,
  isFinalFinished,
  findTournamentByName,
} = require('./parse');

// Netwerklaag voor de eigen Cuescore-lees (besluit: optie B, zie wiki/decisions.md).
// Gebruikt de publieke Cuescore-API (geen key). Quota verwaarloosbaar: een
// handvol calls per poll.

// Cuescore-organisatiestub (mokumpooldarts). Configureerbaar via env voor tests.
const ORG_STUB = process.env.CUESCORE_ORG_STUB || 'mokumpooldarts';
const TIMEOUT_MS = 10000;

// Haalt de HTML van de toernooien-pagina op en geeft de toernooi-ID's van vandaag.
async function getTodaysTournamentIds({ orgStub = ORG_STUB, now = new Date() } = {}) {
  const url = `https://cuescore.com/${orgStub}/tournaments`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Cuescore toernooien-pagina gaf ${res.status}`);
  const html = await res.text();
  return parseTodaysTournamentIds(html, formatCuescoreDate(now));
}

// Haalt het genormaliseerde detail van één toernooi op.
async function getTournament(id) {
  const url = `https://api.cuescore.com/tournament/?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Cuescore toernooi ${id} gaf ${res.status}`);
  const data = await res.json();
  return normalizeTournament(data);
}

// Haalt alle toernooien van vandaag op (genormaliseerd). Handig om een schema-
// regel op naam te koppelen aan de actuele Cuescore-naam.
async function getTodaysTournaments({ now = new Date() } = {}) {
  const ids = await getTodaysTournamentIds({ now });
  const out = [];
  for (const id of ids) out.push(await getTournament(id));
  return out;
}

// Zoekt over alle toernooien van vandaag naar het toernooi dat nú op de gegeven
// tafel speelt. Retourneert { tournament, match } of null.
async function findTableTournament(tableNumber, { now = new Date() } = {}) {
  const ids = await getTodaysTournamentIds({ now });
  for (const id of ids) {
    const tournament = await getTournament(id);
    const match = findTableMatch(tournament, tableNumber, { onlyPlaying: true });
    if (match) return { tournament, match };
  }
  return null;
}

// True als het toernooi als geheel is afgerond (primaire auto-stop-trigger).
async function isTournamentFinished(id) {
  const tournament = await getTournament(id);
  return tournament.finished;
}

module.exports = {
  getTodaysTournamentIds,
  getTournament,
  findTableTournament,
  isTournamentFinished,
  // pure helpers ook exporteren voor hergebruik/tests
  findTableMatch,
  isFinalFinished,
};
