const { effectiveStart } = require('./planning');
const { zaalDag } = require('../schedule/schedule');

// Tafels vrijmaken vóór een ingepland toernooi (#93). Puur → testbaar.
//
// Aanleiding (03-08): om 16:40 startte iemand een losse challenge-uitzending op tafel 1 en
// vergat die te stoppen. Diezelfde tafel werd 's avonds voor het toernooi gebruikt. Gevolg:
// één video van acht en een half uur, waarvan de eerste tweeënhalf uur een lege tafel.
//
// Vanaf een half uur voor de start van een ingepland toernooi sluiten we daarom alles wat er
// nog op zijn tafels draait en er niet bij hoort. Het toernooi krijgt zo een schone tafel en
// een video die begint waar hij hoort te beginnen.
//
// Wat we met RUST laten:
//   - een uitzending van dít toernooi zelf (die is al goed, of is met de hand voorgestart)
//   - al gestopte uitzendingen
//   - tafels die niet in de planning van dit toernooi staan
// Er wordt bewust NIET gekeken of er een wedstrijd bezig is: dit gaat om een challenge of
// een vergeten uitzending, en die moet weg vóórdat het toernooi begint. Wie op dat moment
// nog een challenge speelt kan gewoon doorspelen — alleen de uitzending stopt.

const STANDAARD_MINUTEN_VOOR = 30;

// Welke tafels moeten nu vrijgemaakt worden?
// Retour: [{ tableNumber, videoId, reden, tournamentId, tournamentName }]
function vrijTeMaken(planning, store, now, { minutenVoor = STANDAARD_MINUTEN_VOOR } = {}) {
  const vandaag = zaalDag(now);
  const uit = [];
  const gezien = new Set();

  for (const rec of planning || []) {
    if (!rec || rec.planned !== true || rec.enabled === false || rec.geannuleerd) continue;

    const start = Date.parse(effectiveStart(rec) || '');
    if (Number.isNaN(start)) continue;

    // Het venster loopt van `minutenVoor` vóór de start tot de start zelf. Daarna niet meer:
    // vanaf dat moment hoort de tafel bij het toernooi, en dan zou een uitzending die net
    // is aangemaakt meteen weer gesloten worden.
    const vanaf = start - minutenVoor * 60000;
    if (now.getTime() < vanaf || now.getTime() > start) continue;

    for (const tafel of rec.tafels || []) {
      const entry = (store || {})[String(tafel)];
      if (!entry || entry.stopped || !entry.videoId) continue;
      // Hoort deze uitzending al bij dit toernooi? Dan met rust laten.
      if (entry.tournamentId != null && String(entry.tournamentId) === String(rec.tournamentId)) continue;
      if (gezien.has(Number(tafel))) continue;
      gezien.add(Number(tafel));

      uit.push({
        tableNumber: Number(tafel),
        videoId: entry.videoId,
        tournamentId: rec.tournamentId,
        tournamentName: rec.name || '',
        reden: entry.adhoc || entry.tournamentId == null
          ? `losse uitzending stond nog open; "${rec.name || 'toernooi'}" begint zo op deze tafel`
          : `uitzending van een ander toernooi stond nog open; "${rec.name || 'toernooi'}" begint zo op deze tafel`,
      });
    }
  }
  return uit;
}

module.exports = { vrijTeMaken, STANDAARD_MINUTEN_VOOR, zaalDagVan: zaalDag };
