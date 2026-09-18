// Pure logica voor de automatische stop van een competitiestream (#145). Géén netwerk → testbaar.
//
// Besluit Peter (17-09): stoppen zodra de teamwedstrijd klaar is, voor "nu starten" én
// ingepland. "Klaar" heeft twee signalen, omdat captains de wedstrijd in Cuescore vaak pas
// de volgende dag afsluiten (vorige week bij 4 van de 6 wedstrijden in onze zaal):
//   1. Cuescore meldt `finished`.
//   2. De stand is compleet: thuis + uit = het aantal partijen van dat niveau. De stand wordt
//      live bijgehouden, dus dit komt meestal meteen na de laatste partij.
// Nooit op tijd of inactiviteit: die regels kapten lopende wedstrijden af (#134).

// Aantal partijen per wedstrijd. Klasse: gecontroleerd op alle afgeronde Klasse-wedstrijden
// van september 2026 (stand telt altijd op tot 6). Divisies en Eredivisie: 7 volgens de
// KNBB-wedstrijdformulieren 2026-2027 (6 partijen + 10-ball koppel).
function aantalPartijen(niveau) {
  const n = String(niveau || '').toLowerCase();
  if (n.includes('klasse')) return 6;
  if (n.includes('divisie')) return 7; // dekt ook "Eredivisie"
  return null;
}

// De stand-regel telt pas na deze tijd sinds de start van de stream. Een teamwedstrijd duurt
// in de praktijk 3 à 4 uur; mocht Cuescore de stand ooit anders tellen dan in partijen
// (bijvoorbeeld in frames), dan voorkomt dit dat we een net begonnen wedstrijd afkappen.
const STAND_REGEL_NA_MS = 90 * 60 * 1000;

// Waarom is deze wedstrijd klaar? Retour: tekst, of null als hij (nog) niet klaar is.
// `match` is een genormaliseerde Cuescore-wedstrijd ({ status, scoreA, scoreB }).
function competitieKlaarReden(entry, match, now) {
  if (!entry || !match) return null;
  if (match.status === 'finished') return 'Cuescore meldt de wedstrijd als afgerond';

  const partijen = aantalPartijen(entry.niveau);
  const a = Number(match.scoreA), b = Number(match.scoreB);
  if (!partijen || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a + b < partijen) return null;

  const start = new Date(entry.scheduledStart).getTime();
  if (!Number.isFinite(start) || now.getTime() - start < STAND_REGEL_NA_MS) return null;
  return `stand ${a}-${b}: alle ${partijen} partijen gespeeld`;
}

// Speling op de wachttijd (#147). checkStops tikt eens per minuut en `klaarSinds` is het
// moment van zo'n tik. De tik 5 minuten later valt door timer-jitter soms net ná en soms
// net vóór klaarSinds + 5:00; zonder speling stopte de stream dan pas een minuut later (na
// 6 minuten). Het competitiescherm telt af naar dat stopmoment (bedankscherm = laatste
// minuut), dus het moet voorspelbaar op de 5-minutentik vallen.
const TIK_SPELING_MS = 30 * 1000;

// Wat moet checkStops nu doen? Retour:
//   { klaarSinds: iso|null, stoppen: bool, reden: tekst|null }
// `klaarSinds` blijft staan zodra het eerste signaal er is. Een stand die daarna even
// terugvalt (correctie) maakt de wachttijd dus niet opnieuw; na de wachttijd stoppen we.
function competitieStopBesluit(entry, match, now, { wachtMs = 5 * 60 * 1000 } = {}) {
  const reden = competitieKlaarReden(entry, match, now);
  const klaarSinds = entry && entry.competitieKlaarSinds
    ? entry.competitieKlaarSinds
    : (reden ? now.toISOString() : null);
  if (!klaarSinds) return { klaarSinds: null, stoppen: false, reden: null };
  const verstreken = now.getTime() - new Date(klaarSinds).getTime();
  return {
    klaarSinds,
    stoppen: verstreken >= wachtMs - TIK_SPELING_MS,
    reden: reden || (entry && entry.competitieKlaarReden) || 'wedstrijd klaar',
  };
}

// Mag deze ronde Cuescore bevraagd worden? Hooguit eens per `intervalMs`: een
// competitietoernooi is 0,5 à 1 MB en checkStops draait elke minuut.
function moetCompetitieChecken(entry, now, intervalMs = 2 * 60 * 1000) {
  if (!entry || !entry.competitieLaatsteCheck) return true;
  return now.getTime() - new Date(entry.competitieLaatsteCheck).getTime() >= intervalMs;
}

module.exports = {
  aantalPartijen, competitieKlaarReden, competitieStopBesluit, moetCompetitieChecken, STAND_REGEL_NA_MS,
};
