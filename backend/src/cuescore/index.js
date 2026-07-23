const {
  formatCuescoreDate,
  parseTodaysTournamentIds,
  upcomingTournamentIds,
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

// Cuescore's toernooien-pagina heeft een schakelaar: `s=2` = Active/Finished (de
// STANDAARD-weergave) en `s=0` = Upcoming. Een toernooi dat vanavond om 19:30 begint
// staat tot het startmoment alléén onder Upcoming. Haalden we alleen de standaard op,
// dan zag de planning-import nooit iets → planning.json bleef leeg → geen broadcast →
// tafels werden handmatig (ad-hoc) gestart, waarna auto-stop/podium/finalize werd
// overgeslagen (incident 22-07-2026). Daarom halen we beide weergaven op.
const WEERGAVEN = ['s=2', 's=0'];

// Haalt beide weergaven van de toernooien-pagina op. Eén onbereikbare weergave is
// niet fataal (we werken door met wat we hebben); alleen als álles faalt gooien we.
async function haalToernooienPaginas(orgStub) {
  const paginas = [];
  const fouten = [];
  for (const s of WEERGAVEN) {
    try {
      const res = await fetch(`https://cuescore.com/${orgStub}/tournaments?${s}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`gaf ${res.status}`);
      paginas.push(await res.text());
    } catch (e) {
      fouten.push(`${s}: ${e.message}`);
    }
  }
  if (paginas.length === 0) throw new Error(`Cuescore toernooien-pagina onbereikbaar (${fouten.join('; ')})`);
  return paginas;
}

// Haalt de HTML van de toernooien-pagina op en geeft de toernooi-ID's van vandaag.
async function getTodaysTournamentIds({ orgStub = ORG_STUB, now = new Date() } = {}) {
  const paginas = await haalToernooienPaginas(orgStub);
  const vandaag = formatCuescoreDate(now);
  const ids = [];
  for (const html of paginas) {
    for (const id of parseTodaysTournamentIds(html, vandaag)) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
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

// Haalt alle geplande Mokum-toernooien op van vandaag tot `days` dagen vooruit
// (genormaliseerd, incl. geplande start/stop). Voor de planning-import.
async function getUpcomingTournaments({ orgStub = ORG_STUB, now = new Date(), days = 14 } = {}) {
  const paginas = await haalToernooienPaginas(orgStub);
  const ids = [];
  for (const html of paginas) {
    for (const id of upcomingTournamentIds(html, now, { days })) if (!ids.includes(id)) ids.push(id);
  }
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
  getTodaysTournaments,
  getUpcomingTournaments,
  findTableTournament,
  isTournamentFinished,
  // pure helpers ook exporteren voor hergebruik/tests
  findTableMatch,
  isFinalFinished,
  findTournamentByName,
};
