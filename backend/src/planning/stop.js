const { cameraTablesWithMatchToday } = require('./league');
const { isFinalFinished, finalMatch } = require('../cuescore/parse');

// Pure beslislogica voor de auto-stop. Bepaalt of een lopende broadcast (één
// entry uit broadcasts/<datum>.json) gestopt moet worden. Géén netwerk → testbaar.
//
// Regels:
// - Ad-hoc of al gestopte streams: nooit automatisch stoppen (handmatig).
// - stopOverride bereikt → stoppen.
// - Enkeldaags toernooi: stoppen als het toernooi `Finished` is, óf als de finale
//   gespeeld is en deze tafel geen wedstrijd meer heeft — maar pas ná de podium-grace
//   (opts.graceMs), zodat het medaillescherm eerst ~1 min in beeld blijft. De geplande
//   eindtijd (plannedStop) blijft een direct vangnet (werkt ook als Cuescore onbereikbaar is).
// - Doorlopende competitie: stoppen als er vandaag geen niet-afgeronde wedstrijd
//   meer op die tafel is (laatste wedstrijd van de avond gespeeld).

// Is het (enkeldaagse) toernooi klaar op deze tafel? = het podium-waardige moment:
// Cuescore-status 'Finished', óf de finale gespeeld en deze tafel heeft geen
// niet-afgeronde wedstrijd meer (bijv. een bronzen finale die nog doorloopt).
function toernooiKlaar(entry, tournament, now) {
  if (!tournament) return false;
  if (tournament.finished === true) return true;
  return isFinalFinished(tournament) &&
    cameraTablesWithMatchToday(tournament, [entry.tableNumber], now).length === 0;
}

function shouldStop(entry, record, tournament, now, opts = {}) {
  if (!entry || entry.stopped || entry.adhoc) return false;
  const graceMs = opts.graceMs || 0;

  const override = record && record.stopOverride;
  if (override) {
    const t = Date.parse(override);
    if (!Number.isNaN(t) && t <= now.getTime()) return true;
  }

  const type = (record && record.type) || 'tournament';

  // Eind-tijd-vangnet (fase 3, #42): een ingepland enkeldaags toernooi stopt sowieso
  // zodra plannedStop (de Cuescore-eindtijd) voorbij is — óók als Cuescore onbereikbaar
  // is of de status niet op 'Finished' springt. (Geen grace: dit is een noodrem.)
  if (type !== 'competition') {
    const eind = record && record.plannedStop;
    if (eind) {
      const t = Date.parse(eind);
      if (!Number.isNaN(t) && t <= now.getTime()) return true;
    }
  }

  if (!tournament) return false;

  if (type === 'competition') {
    return cameraTablesWithMatchToday(tournament, [entry.tableNumber], now).length === 0;
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
      return true;
    }
  }

  // Enkeldaags toernooi klaar? → eerst het podium z'n minuut geven, dán stoppen.
  if (!toernooiKlaar(entry, tournament, now)) return false;
  if (graceMs > 0) {
    // finaleKlaarSinds wordt door checkStops op de entry gestempeld zodra het toernooi
    // klaar is. Pas graceMs later daadwerkelijk stoppen (podium blijft zolang staan).
    const sinds = Date.parse((entry && entry.finaleKlaarSinds) || '');
    if (Number.isNaN(sinds)) return false; // nog niet gestempeld → volgende ronde
    return now.getTime() - sinds >= graceMs;
  }
  return true;
}

module.exports = { shouldStop, toernooiKlaar };
