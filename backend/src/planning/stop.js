const { cameraTablesWithMatchToday } = require('./league');

// Pure beslislogica voor de auto-stop. Bepaalt of een lopende broadcast (één
// entry uit broadcasts/<datum>.json) gestopt moet worden. Géén netwerk → testbaar.
//
// Regels:
// - Ad-hoc of al gestopte streams: nooit automatisch stoppen (handmatig).
// - stopOverride bereikt → stoppen.
// - Enkeldaags toernooi: stoppen als het toernooi `Finished` is, óf als de geplande
//   eindtijd (plannedStop) voorbij is (vangnet — werkt ook als Cuescore onbereikbaar is).
// - Doorlopende competitie: stoppen als er vandaag geen niet-afgeronde wedstrijd
//   meer op die tafel is (laatste wedstrijd van de avond gespeeld).
function shouldStop(entry, record, tournament, now) {
  if (!entry || entry.stopped || entry.adhoc) return false;

  const override = record && record.stopOverride;
  if (override) {
    const t = Date.parse(override);
    if (!Number.isNaN(t) && t <= now.getTime()) return true;
  }

  const type = (record && record.type) || 'tournament';

  // Eind-tijd-vangnet (fase 3, #42): een ingepland enkeldaags toernooi stopt sowieso
  // zodra plannedStop (de Cuescore-eindtijd) voorbij is — óók als Cuescore onbereikbaar
  // is of de status niet op 'Finished' springt.
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
  return tournament.finished === true;
}

module.exports = { shouldStop };
