// Pure parse-/normaliseerfuncties voor Cuescore-data. Géén netwerk → volledig
// unit-testbaar. De netwerklaag (index.js) roept deze functies aan.
//
// Logica geleend van de Cuescore Live Notifier (cuescore_timer/run.ps1),
// geport naar Node. Zie wiki/architecture.md voor de velduitleg.

// Regex voor een datumkop op de toernooien-pagina, bijv. "Tuesday, July 8, 2026".
// We vangen het datumdeel ("July 8, 2026") in groep 1.
const DATUM_RE =
  /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Z][a-z]+ \d{1,2}, \d{4})/g;

// Regex voor toernooi-links: /tournament/<slug>/<id>.
const TOERNOOI_LINK_RE = /\/tournament\/[^/]+\/(\d+)/g;

// Herkent de finale-ronde (zoals in run.ps1).
const FINALE_RE = /^final$|^finale$/i;

// Maandnamen → nummer, voor het parsen van "July 8, 2026".
const MAAND = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

// "July 8, 2026" → "2026-07-08" (puur, geen tijdzone-gedoe). Null bij onbekend.
function cuescoreDateToISO(dateStr) {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec((dateStr || '').trim());
  if (!m || !MAAND[m[1]]) return null;
  const mm = String(MAAND[m[1]]).padStart(2, '0');
  const dd = String(parseInt(m[2], 10)).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

// Formatteert een datum naar het formaat dat op de Cuescore-pagina staat
// ("July 8, 2026"), in de zaal-tijdzone. en-US geeft de maandnaam voluit en de
// dag zonder voorloopnul, wat overeenkomt met DATUM_RE (\d{1,2}).
function formatCuescoreDate(date, timeZone = 'Europe/Amsterdam') {
  return date.toLocaleDateString('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Haalt de toernooi-ID's van vandaag uit de HTML van de toernooien-pagina.
// Filtert de per-datum-groepen op de datumkop `todayStr` ("July 8, 2026").
function parseTodaysTournamentIds(html, todayStr) {
  const ids = [];
  for (const groep of parseTournamentsByDate(html)) {
    if (groep.date !== todayStr) continue;
    for (const id of groep.ids) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

// Groepeert alle toernooi-links per datumkop op de toernooien-pagina.
// Elk datumblok loopt tot de VOLGENDE datumkop (of einde), zodat ids niet naar
// een verkeerde datum lekken. → [{ date: "July 8, 2026", datum: "2026-07-08", ids: [..] }, ...]
function parseTournamentsByDate(html) {
  const koppen = [];
  DATUM_RE.lastIndex = 0;
  let m;
  while ((m = DATUM_RE.exec(html)) !== null) {
    koppen.push({ dateStr: m[1].trim(), kopStart: m.index, kopEind: m.index + m[0].length });
  }

  const uit = [];
  for (let i = 0; i < koppen.length; i++) {
    const van = koppen[i].kopEind;
    const tot = i + 1 < koppen.length ? koppen[i + 1].kopStart : html.length;
    const blok = html.substring(van, tot);
    const ids = [];
    TOERNOOI_LINK_RE.lastIndex = 0;
    let t;
    while ((t = TOERNOOI_LINK_RE.exec(blok)) !== null) {
      const id = parseInt(t[1], 10);
      if (!ids.includes(id)) ids.push(id);
    }
    uit.push({ date: koppen[i].dateStr, datum: cuescoreDateToISO(koppen[i].dateStr), ids });
  }
  return uit;
}

// Toernooi-ID's vanaf vandaag tot `days` dagen vooruit (voor de planning-import).
function upcomingTournamentIds(html, now, { days = 14, tz = 'Europe/Amsterdam' } = {}) {
  const vandaagISO = cuescoreDateToISO(formatCuescoreDate(now, tz));
  const grens = new Date(`${vandaagISO}T00:00:00Z`);
  grens.setUTCDate(grens.getUTCDate() + days);
  const grensISO = grens.toISOString().slice(0, 10);

  const ids = [];
  for (const groep of parseTournamentsByDate(html)) {
    if (!groep.datum) continue;
    // 'YYYY-MM-DD' vergelijkt lexicografisch = chronologisch.
    if (groep.datum >= vandaagISO && groep.datum <= grensISO) {
      for (const id of groep.ids) if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

// Normaliseert één wedstrijd uit de Cuescore-API naar ons interne model.
function normalizeMatch(m) {
  return {
    matchId: m.matchId,
    status: m.matchstatus || '',
    // table.name is het fysieke tafelnummer (als string) zodra toegewezen.
    table: m.table && m.table.name != null ? String(m.table.name) : null,
    roundName: m.roundName || '',
    playerA: m.playerA ? { id: m.playerA.playerId, name: m.playerA.name } : null,
    playerB: m.playerB ? { id: m.playerB.playerId, name: m.playerB.name } : null,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
  };
}

// Normaliseert het toernooi-detail uit de Cuescore-API.
function normalizeTournament(data) {
  const matches = Array.isArray(data.matches) ? data.matches.map(normalizeMatch) : [];
  return {
    id: data.tournamentId != null ? data.tournamentId : (data.id != null ? data.id : null),
    name: data.name || '',
    status: data.status || '',
    finished: data.status === 'Finished',
    start: data.starttime || null, // geplande starttijd (uit Cuescore)
    stop: data.stoptime || null,   // geplande eindtijd (kan null zijn)
    matches,
  };
}

// Vindt de wedstrijd op een bepaalde tafel binnen een toernooi.
// Met onlyPlaying=true alleen een lopende wedstrijd; anders bij voorkeur de
// lopende, en anders de laatst gevonden wedstrijd op die tafel.
function findTableMatch(tournament, tableNumber, { onlyPlaying = false } = {}) {
  const t = String(tableNumber);
  const candidates = tournament.matches.filter((m) => m.table === t);
  const playing = candidates.find((m) => m.status === 'playing');
  if (onlyPlaying) return playing || null;
  return playing || candidates[candidates.length - 1] || null;
}

// True als de finale-wedstrijd is afgerond (fijnere stop-trigger dan status).
function isFinalFinished(tournament) {
  return tournament.matches.some(
    (m) => FINALE_RE.test((m.roundName || '').trim()) && m.status === 'finished'
  );
}

// Zoekt in een lijst genormaliseerde toernooien het toernooi waarvan de naam de
// zoekterm bevat (case-insensitief). Gebruikt om een schema-regel ("Fluke
// ranking") te koppelen aan de volledige actuele Cuescore-naam.
function findTournamentByName(tournaments, needle) {
  const n = (needle || '').toLowerCase().trim();
  if (!n) return null;
  return (tournaments || []).find((t) => (t.name || '').toLowerCase().includes(n)) || null;
}

module.exports = {
  DATUM_RE,
  TOERNOOI_LINK_RE,
  FINALE_RE,
  cuescoreDateToISO,
  formatCuescoreDate,
  parseTodaysTournamentIds,
  parseTournamentsByDate,
  upcomingTournamentIds,
  normalizeMatch,
  normalizeTournament,
  findTableMatch,
  isFinalFinished,
  findTournamentByName,
};
