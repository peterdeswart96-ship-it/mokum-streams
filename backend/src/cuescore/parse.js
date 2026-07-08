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
// Voor elke datumkop die gelijk is aan `todayStr` nemen we een venster van 2000
// tekens erna en pakken daaruit de toernooi-links. Zelfde (bewust simpele)
// heuristiek als run.ps1; zie de kanttekening in wiki/gaps.md.
function parseTodaysTournamentIds(html, todayStr) {
  const ids = [];
  DATUM_RE.lastIndex = 0;
  let m;
  while ((m = DATUM_RE.exec(html)) !== null) {
    if (m[1].trim() !== todayStr) continue;
    const start = m.index + m[0].length;
    const blok = html.substring(start, start + 2000);
    let t;
    TOERNOOI_LINK_RE.lastIndex = 0;
    while ((t = TOERNOOI_LINK_RE.exec(blok)) !== null) {
      const id = parseInt(t[1], 10);
      if (!ids.includes(id)) ids.push(id);
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

module.exports = {
  DATUM_RE,
  TOERNOOI_LINK_RE,
  FINALE_RE,
  formatCuescoreDate,
  parseTodaysTournamentIds,
  normalizeMatch,
  normalizeTournament,
  findTableMatch,
  isFinalFinished,
};
