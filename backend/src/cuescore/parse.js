// Pure parse-/normaliseerfuncties voor Cuescore-data. Géén netwerk → volledig
// unit-testbaar. De netwerklaag (index.js) roept deze functies aan.
//
// Logica geleend van de Cuescore Live Notifier (cuescore_timer/run.ps1),
// geport naar Node. Zie wiki/architecture.md voor de velduitleg.

// Regex voor een datumkop op de toernooien-pagina. Cuescore toonde lang "Tuesday, July 8,
// 2026"; sinds medio augustus 2026 is de weekdagnaam weg en staat er kaal "August 18, 2026"
// (in <div class="date upcoming|result">). De weekdag is daarom optioneel — zonder deze fix
// vond parseTournamentsByDate helemaal geen datumkoppen meer, waardoor zowel de planning-
// import als de dag-koppeling (welk toernooi speelt vandaag op welke tafel) leeg bleef.
// We vangen het datumdeel ("July 8, 2026" / "August 18, 2026") in groep 1.
const DATUM_RE =
  /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?([A-Z][a-z]+ \d{1,2}, \d{4})/g;

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

// Cuescore levert tijden in TWEE vormen, afhankelijk van de client (#77):
//   "2026-07-28T17:30:00Z"   — ISO met tijdzone (wat onze Node-client krijgt)
//   "07/28/2026 17:30:00"    — zonder tijdzone (wat curl krijgt)
// Beide beschrijven hetzelfde moment in UTC; dat is naast elkaar geverifieerd op
// hetzelfde toernooi.
//
// De kale vorm is gevaarlijk: `new Date("07/28/2026 17:30:00")` leest die als de LOKALE
// tijd van de machine. Op Azure (UTC) valt dat goed uit, maar op een laptop in
// Nederland scheelt het twee uur — en dan wijken scripts, tests en handmatige checks
// af van wat productie doet. Zet je ooit WEBSITE_TIME_ZONE op de Function App, dan
// verschuift de hele automatisering mee.
//
// Daarom normaliseren we hier, bij binnenkomst, alles naar ISO met tijdzone. Alles
// stroomafwaarts (zaalDag, hoofdstukken, clipvensters) rekent daarna met echte momenten.
const US_DATUM = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const ISO_ZONDER_ZONE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const HEEFT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

function tijdNaarISO(waarde) {
  if (waarde == null || waarde === '') return null;
  const s = String(waarde).trim();

  // Al voorzien van een tijdzone? Dan is het moment ondubbelzinnig — laat de tekst
  // precies zoals 'ie is. Herschrijven zou alleen maar bestaande opgeslagen waarden
  // laten verschuiven (milliseconden erbij) zonder iets op te lossen.
  if (HEEFT_ZONE.test(s) && !Number.isNaN(Date.parse(s))) return s;

  const us = US_DATUM.exec(s);
  if (us) {
    const [, mm, dd, jjjj, uur, min, sec] = us;
    return new Date(Date.UTC(+jjjj, +mm - 1, +dd, +uur, +min, +(sec || 0))).toISOString();
  }

  // ISO zonder zone: óók als UTC lezen, nooit als lokale tijd van de host.
  const iso = ISO_ZONDER_ZONE.exec(s);
  if (iso) {
    const [, jjjj, mm, dd, uur, min, sec] = iso;
    return new Date(Date.UTC(+jjjj, +mm - 1, +dd, +uur, +min, +(sec || 0))).toISOString();
  }

  // Al voorzien van een tijdzone (of iets anders herkenbaars) → laten staan als moment.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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

// Toernooi-ID's van NU LOPENDE toernooien op de organisatiepagina (#86).
//
// Een doorlopend toernooi (zoals "Mokum 14.1 Summer league", 16 juni t/m 31 augustus)
// staat niet op /tournaments en valt bovendien buiten het venster van veertien dagen,
// want het staat onder zijn startdatum. Daardoor kwam het nooit in de planning, werd een
// stream op zo'n avond nooit gekoppeld, en bleef die zonder thumbnail, hoofdstukken en
// auto-stop liggen (30 en 31 juli; tafel 3 liep dertien uur door tot de nachtstop).
//
// Cuescore markeert een lopend toernooi zelf met `class="date live"` op de
// organisatiepagina. Dat is betrouwbaarder dan zelf datums vergelijken: het is hun eigen
// oordeel over wat er nu speelt.
const LIVE_MARKER = 'class="date live"';

function lopendeTournamentIds(html) {
  const ids = [];
  const delen = String(html || '').split(LIVE_MARKER);
  // Deel 0 staat vóór de eerste markering; elk volgend deel begint bij een lopend
  // toernooi, dus de EERSTE toernooi-link daarin hoort bij die rij.
  for (let i = 1; i < delen.length; i++) {
    const m = /\/tournament\/[^/"]+\/(\d+)/.exec(delen[i]);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
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

// Toernooi-ID's van recent (vandaag en eerder), nieuwste datum eerst. Kandidaten voor de
// winnaars-sheet (#72): de netwerklaag haalt deze op en houdt alleen de afgeronde met een
// vaststelbare winnaar over.
function recentTournamentIds(html, now, { max = 12, tz = 'Europe/Amsterdam' } = {}) {
  const vandaagISO = cuescoreDateToISO(formatCuescoreDate(now, tz));
  const groepen = parseTournamentsByDate(html)
    .filter((g) => g.datum && g.datum <= vandaagISO)
    .sort((a, b) => b.datum.localeCompare(a.datum)); // nieuwste eerst
  const ids = [];
  for (const g of groepen) {
    for (const id of g.ids) {
      if (!ids.includes(id)) {
        ids.push(id);
        if (ids.length >= max) return ids;
      }
    }
  }
  return ids;
}

// Leest de rack-log (`notes`) van een wedstrijd uit en geeft de racks terug die met een
// RUN-OUT gewonnen zijn, mét het moment waarop dat rack begon (#67). Cuescore logt per
// rack o.a. "frame start" en "B frame win runout", allemaal met tijdstempel — daarmee
// kunnen we in de video naar het begin van precies dát rack springen in plaats van naar
// het begin van de hele partij. Niet elke wedstrijd heeft een log (oudere data): dan leeg.
function runoutRacksUitNotes(notes) {
  const uit = [];
  let frameStart = null;
  for (const n of notes || []) {
    const tekst = String((n && n.note) || '');
    if (/^frame start$/i.test(tekst)) { frameStart = tijdNaarISO(n.time); continue; }
    const m = /^([AB])\s+frame win\s+runout$/i.exec(tekst.trim());
    if (!m) continue;
    const van = Date.parse(frameStart || '');
    const tot = Date.parse(tijdNaarISO(n.time) || '');
    uit.push({
      kant: m[1].toUpperCase(),
      start: frameStart,
      eind: tijdNaarISO(n.time),
      // Hoelang het rack duurde. Onmisbaar om ingetikte-achteraf-standen te herkennen:
      // die leveren racks van een paar tienden van een seconde op (zie archief.js).
      duurSec: Number.isNaN(van) || Number.isNaN(tot) ? null : Math.round((tot - van) / 1000),
    });
  }
  return uit;
}

// Normaliseert één wedstrijd uit de Cuescore-API naar ons interne model.
function normalizeMatch(m) {
  return {
    matchId: m.matchId,
    status: m.matchstatus || '',
    // table.name is het fysieke tafelnummer (als string) zodra toegewezen.
    table: m.table && m.table.name != null ? String(m.table.name) : null,
    roundName: m.roundName || '',
    start: tijdNaarISO(m.starttime), // geplande wedstrijdtijd (voor league-per-avond)
    stop: tijdNaarISO(m.stoptime),
    // image = spelersfoto-URL, flag = landvlag-URL (beide uit de Cuescore-API; kunnen
    // ontbreken). Gebruikt door het eigen tafelraster (#54).
    playerA: m.playerA
      ? { id: m.playerA.playerId, name: m.playerA.name, image: m.playerA.image || null, flag: (m.playerA.country && m.playerA.country.image) || null }
      : null,
    playerB: m.playerB
      ? { id: m.playerB.playerId, name: m.playerB.name, image: m.playerB.image || null, flag: (m.playerB.country && m.playerB.country.image) || null }
      : null,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    // Run-outs per speler (#67). Op het iPad-scorebord kiest de teller per rack
    // "Rack +1" óf "Runout +1", dus dit veld is betrouwbaar gevuld.
    runoutsA: Number(m.runoutsA) || 0,
    runoutsB: Number(m.runoutsB) || 0,
    // Racks die met een run-out gewonnen zijn, met het begin-moment van dat rack.
    runoutRacks: runoutRacksUitNotes(m.notes),
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
    discipline: data.discipline || '', // spelsoort ("9-Ball", "10-Ball", ...) voor de thumbnail (#56)
    start: tijdNaarISO(data.starttime), // geplande starttijd (uit Cuescore)
    stop: tijdNaarISO(data.stoptime),   // geplande eindtijd (kan null zijn)
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
  return ((tournament && tournament.matches) || []).some(
    (m) => FINALE_RE.test((m.roundName || '').trim()) && m.status === 'finished'
  );
}

// De finale-wedstrijd van het toernooi (of null). Bij voorkeur een lopende/afgeronde,
// anders de eerst gevonden finale (bijv. nog gepland). Voor #72: zodra de finale bezig is,
// hebben we alleen de finale-tafel nog nodig en kunnen de overige camera-tafels sluiten.
function finalMatch(tournament) {
  const finales = ((tournament && tournament.matches) || []).filter(
    (m) => FINALE_RE.test((m.roundName || '').trim())
  );
  if (!finales.length) return null;
  return finales.find((m) => m.status === 'playing')
    || finales.find((m) => m.status === 'finished')
    || finales[0];
}

// Is de finale bezig of gespeeld (dus niet meer "nog te beginnen")? Trigger voor #72.
function isFinalUnderway(tournament) {
  const f = finalMatch(tournament);
  return !!(f && (f.status === 'playing' || f.status === 'finished'));
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
  recentTournamentIds,
  lopendeTournamentIds,
  normalizeMatch,
  runoutRacksUitNotes,
  normalizeTournament,
  findTableMatch,
  isFinalFinished,
  finalMatch,
  isFinalUnderway,
  findTournamentByName,
  tijdNaarISO,
};
