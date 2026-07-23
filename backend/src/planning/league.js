const { zaalDelen } = require('../schedule/schedule');

// Per-avond-logica voor doorlopende competities (leagues). Een league is één
// doorlopend Cuescore-tournament; de streameenheid is de wedstrijden van vandaag.
// Deze functies zijn puur (op een al opgehaald, genormaliseerd tournament) →
// unit-testbaar. Zie wiki/gaps.md #14/#16.
//
// LET OP: de exacte vorm van match.starttime/table bij een actieve league met
// gelote wedstrijden is nog niet live geverifieerd (gaps #14). Getest op fixtures.

function datumInZaal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return zaalDelen(d).datum; // 'YYYY-MM-DD' in Europe/Amsterdam
}

// Welke van de toegestane camera-tafels hebben vandaag een (niet-afgeronde)
// wedstrijd? Retour: [{ tableNumber, earliestStart }] met de vroegste starttijd.
function cameraTablesWithMatchToday(tournament, cameraTables, now) {
  const vandaag = zaalDelen(now).datum;
  const toegestaan = new Set((cameraTables || []).map(String));
  const perTafel = new Map();

  for (const m of (tournament && tournament.matches) || []) {
    if (!m.table || !toegestaan.has(String(m.table))) continue;
    if (!m.start || datumInZaal(m.start) !== vandaag) continue;
    if (m.status === 'finished') continue;
    const huidig = perTafel.get(String(m.table));
    if (!huidig || m.start < huidig) perTafel.set(String(m.table), m.start);
  }

  return [...perTafel.entries()].map(([t, earliestStart]) => ({
    tableNumber: Number(t),
    earliestStart,
  }));
}

// Her-resolveer de tafels van een (enkeldaags) toernooi op START-moment (#42, fase 2):
// houd van de GEPLANDE tafels alleen die over waar Cuescore vandaag echt een
// niet-afgeronde wedstrijd op zet (nu spelend, of vandaag gepland) — zo streamen we
// geen lege tafel (bijv. 15/16 zonder wedstrijd). Heeft Cuescore nog geen
// tafeltoewijzing (loting niet gemaakt) → val terug op de geplande tafels, zodat de
// stream toch begint (de pauze-jumbotron dekt een lege tafel netjes af). Pure functie.
function herresolveerTafels(tournament, geplandeTafels, now) {
  const gepland = new Set((geplandeTafels || []).map(String));
  const vandaag = zaalDelen(now).datum;
  const metWedstrijd = new Set();
  for (const m of (tournament && tournament.matches) || []) {
    if (!m.table || !gepland.has(String(m.table))) continue;
    if (m.status === 'finished') continue;
    const speelt = m.status === 'playing';
    const vandaagGepland = m.start && datumInZaal(m.start) === vandaag;
    if (speelt || vandaagGepland) metWedstrijd.add(Number(m.table));
  }
  const resolved = [...metWedstrijd].sort((a, b) => a - b);
  return resolved.length ? resolved : (geplandeTafels || []).map(Number);
}

// Welke camera-tafels van een league moeten NU een broadcast krijgen?
// (er is vandaag een wedstrijd én we zitten in het pre-roll-venster van de
// vroegste wedstrijd op die tafel).
function leagueDueTables(tournament, record, now, { graceMinuten = 30 } = {}) {
  const preRoll = (record.preRollMinuten == null ? 10 : record.preRollMinuten) * 60000;
  const nu = now.getTime();
  return cameraTablesWithMatchToday(tournament, record.tafels || [], now).filter(({ earliestStart }) => {
    const s = Date.parse(earliestStart);
    return !Number.isNaN(s) && nu >= s - preRoll && nu <= s + graceMinuten * 60000;
  });
}

module.exports = { cameraTablesWithMatchToday, leagueDueTables, herresolveerTafels, datumInZaal };
