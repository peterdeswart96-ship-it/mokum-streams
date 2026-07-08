const { cameraTablesWithMatchToday } = require('./league');

// Pure beslislogica voor de auto-stop. Bepaalt of een lopende broadcast (één
// entry uit broadcasts/<datum>.json) gestopt moet worden. Géén netwerk → testbaar.
//
// Regels:
// - Ad-hoc of al gestopte streams: nooit automatisch stoppen (handmatig).
// - stopOverride bereikt → stoppen.
// - Enkeldaags toernooi: stoppen als het toernooi `Finished` is.
// - Doorlopende competitie: stoppen als er vandaag geen niet-afgeronde wedstrijd
//   meer op die tafel is (laatste wedstrijd van de avond gespeeld).
function shouldStop(entry, record, tournament, now) {
  if (!entry || entry.stopped || entry.adhoc) return false;

  const override = record && record.stopOverride;
  if (override) {
    const t = Date.parse(override);
    if (!Number.isNaN(t) && t <= now.getTime()) return true;
  }

  if (!tournament) return false;

  const type = (record && record.type) || 'tournament';
  if (type === 'competition') {
    return cameraTablesWithMatchToday(tournament, [entry.tableNumber], now).length === 0;
  }
  return tournament.finished === true;
}

module.exports = { shouldStop };
