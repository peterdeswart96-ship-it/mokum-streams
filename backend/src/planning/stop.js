const { cameraTablesWithMatchToday } = require('./league');
const { isFinalFinished, finalMatch, findTableMatch } = require('../cuescore/parse');

// Pure beslislogica voor de auto-stop. Bepaalt of een lopende broadcast (één
// entry uit broadcasts/<datum>.json) gestopt moet worden. Géén netwerk → testbaar.
//
// Regels:
// - Ad-hoc of al gestopte streams: nooit automatisch stoppen (handmatig).
// - Speelt er NU een wedstrijd op deze tafel? → nooit automatisch stoppen (#76).
// - stopOverride (de eindtijd uit de planner) bereikt → stoppen.
// - Enkeldaags toernooi: stoppen als het toernooi `Finished` is, óf als de finale
//   gespeeld is en deze tafel geen wedstrijd meer heeft — maar pas ná de podium-grace
//   (opts.graceMs), zodat het medaillescherm eerst ~1 min in beeld blijft.
// - Doorlopende competitie: stoppen als er vandaag geen niet-afgeronde wedstrijd
//   meer op die tafel is (laatste wedstrijd van de avond gespeeld).
//
// LET OP (#76, incident 27-07-2026): de Cuescore-eindtijd (`plannedStop`) is hier
// bewust GÉÉN stopreden meer. Cuescore vult dat veld met een plaatsvuller — bij
// "MEGA Summer Ranking #25" stond er 23:59 terwijl de finale om 23:57 begon en tot
// 00:10 duurde. De oude noodrem kapte die finale na 72 seconden af. Het echte
// vangnet is nu tweeledig: de eindtijd die je in de planner zet (stopOverride,
// standaard 01:00) én de nachtelijke veiligheids-stop van 02:00 (nachtStop.js) —
// die laatste kijkt niet naar Cuescore en stopt dus altijd, wat er ook gebeurt.

// Is het (enkeldaagse) toernooi klaar op deze tafel? = het podium-waardige moment:
// Cuescore-status 'Finished', óf de finale gespeeld en deze tafel heeft geen
// niet-afgeronde wedstrijd meer (bijv. een bronzen finale die nog doorloopt).
function toernooiKlaar(entry, tournament, now) {
  if (!tournament) return false;
  if (tournament.finished === true) return true;
  return isFinalFinished(tournament) &&
    cameraTablesWithMatchToday(tournament, [entry.tableNumber], now).length === 0;
}

// Meldt Cuescore een lopende wedstrijd op deze tafel? Zo ja, dan is er publiek dat
// kijkt en mag geen enkele automatische regel de stream afkappen (#76). Bewust
// onafhankelijk van datums: `findTableMatch` kijkt alleen naar tafel + status, dus
// dit werkt ook ná middernacht, wanneer de datum-filters omrollen naar de nieuwe dag.
function wedstrijdSpeelt(entry, tournament) {
  if (!tournament || !entry || !Array.isArray(tournament.matches)) return false;
  return !!findTableMatch(tournament, entry.tableNumber, { onlyPlaying: true });
}

// Waarom moet deze stream stoppen? Retour: korte Nederlandse reden, of null als 'ie
// door mag draaien. De reden gaat mee de log in (#76) — bij het incident van 27-07
// stond er alleen "1 stopStream-commando: tafel 1" en was niet te zien wáárom.
function stopReden(entry, record, tournament, now, opts = {}) {
  if (!entry || entry.stopped || entry.adhoc) return null;
  const graceMs = opts.graceMs || 0;

  // Harde regel (#76): een lopende wedstrijd kappen we nooit af. Blijft Cuescore per
  // ongeluk op 'playing' hangen (teller sluit de partij niet af), dan ruimt de
  // nachtstop van 02:00 het op — liever een half uur te lang dan een finale missen.
  if (wedstrijdSpeelt(entry, tournament)) return null;

  // Eindtijd uit de planner. Werkt óók als Cuescore onbereikbaar is (tournament = null).
  const override = record && record.stopOverride;
  if (override) {
    const t = Date.parse(override);
    if (!Number.isNaN(t) && t <= now.getTime()) return `ingestelde eindtijd bereikt (${override})`;
  }

  if (!tournament) return null;

  const type = (record && record.type) || 'tournament';

  if (type === 'competition') {
    return cameraTablesWithMatchToday(tournament, [entry.tableNumber], now).length === 0
      ? 'competitie: laatste wedstrijd van de avond op deze tafel gespeeld'
      : null;
  }

  // #72: overige camera-tafels sluiten zodra de finale BEGINT. De finale speelt op één
  // tafel; een andere camera-tafel van hetzelfde toernooi heeft dan niets meer te tonen
  // (geen niet-afgeronde wedstrijd) → direct sluiten, géén podium-grace (het medaille-
  // moment komt op de finale-tafel). De finale-tafel zelf loopt door tot 'ie klaar is
  // (die stopt via toernooiKlaar hieronder, mét grace zodat het podium in beeld blijft).
  const finale = finalMatch(tournament);
  if (finale && (finale.status === 'playing' || finale.status === 'finished')) {
    const opFinaleTafel = finale.table != null && String(entry.tableNumber) === String(finale.table);
    if (!opFinaleTafel && cameraTablesWithMatchToday(tournament, [entry.tableNumber], now).length === 0) {
      return `finale bezig op tafel ${finale.table == null ? '?' : finale.table}; deze tafel heeft geen wedstrijd meer (#72)`;
    }
  }

  // Enkeldaags toernooi klaar? → eerst het podium z'n minuut geven, dán stoppen.
  if (!toernooiKlaar(entry, tournament, now)) return null;
  if (graceMs > 0) {
    // finaleKlaarSinds wordt door checkStops op de entry gestempeld zodra het toernooi
    // klaar is. Pas graceMs later daadwerkelijk stoppen (podium blijft zolang staan).
    const sinds = Date.parse((entry && entry.finaleKlaarSinds) || '');
    if (Number.isNaN(sinds)) return null; // nog niet gestempeld → volgende ronde
    if (now.getTime() - sinds < graceMs) return null;
    return `toernooi klaar, podium-grace van ${Math.round(graceMs / 1000)}s verstreken`;
  }
  return 'toernooi klaar';
}

function shouldStop(entry, record, tournament, now, opts = {}) {
  return stopReden(entry, record, tournament, now, opts) !== null;
}

module.exports = { shouldStop, stopReden, toernooiKlaar, wedstrijdSpeelt };
