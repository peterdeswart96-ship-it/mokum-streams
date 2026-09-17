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
      // Niet vrijmaken wat ná het openen van dit venster is aangemaakt (#128).
      //
      // Op 16-09 stonden er twee planning-records voor hetzelfde toernooi (#127). De
      // uitzending die record A om 19:05 aanmaakte, was volgens record B "van een ander
      // toernooi" en werd om 19:06 gesloten — waarna createBroadcasts 'm opnieuw maakte,
      // en zo verder. Vier broadcasts in een kwartier, video's van 51 seconden.
      //
      // De grens die dat uitsluit zonder #93 te breken: een uitzending die is aangemaakt
      // nadat dit venster openging (een half uur voor de start) is per definitie geen
      // vergeten uitzending van eerder op de dag — dat is waar deze regel voor bedoeld is.
      // Een echte vergeten challenge (het geval van 03-08, begonnen om 16:40) dateert
      // ruim van vóór dat moment en wordt dus gewoon nog opgeruimd.
      //
      // Geen `aangemaaktOp` (oudere entries, en handmatig via het dashboard gestarte
      // streams) telt als "oud" — precies de gevallen die #93 juist moet opruimen.
      const aangemaakt = Date.parse(entry.aangemaaktOp || '');
      if (!Number.isNaN(aangemaakt) && aangemaakt >= vanaf) continue;
      // Hoort deze uitzending al bij dit toernooi? Dan met rust laten — MAAR alleen als hij
      // ook echt VOOR dit toernooi is gestart.
      //
      // Een losse uitzending die eerder op de avond is begonnen kan door de automatische
      // koppeling (#69) alsnog aan dit toernooi zijn gehangen. Die draagt dan wel het juiste
      // tournamentId, maar is begonnen toen er nog niets speelde. Zou die hier blijven staan,
      // dan is de tafel om 19:10 bezet, maakt createBroadcasts geen eigen uitzending aan, en
      // krijg je één video die uren te vroeg begint — exact het probleem van 03-08 dat deze
      // regel juist moest voorkomen. `autoGekoppeld` onderscheidt de twee gevallen.
      const eigen = entry.tournamentId != null && String(entry.tournamentId) === String(rec.tournamentId);
      if (eigen && !entry.autoGekoppeld) continue;
      if (gezien.has(Number(tafel))) continue;
      gezien.add(Number(tafel));

      uit.push({
        tableNumber: Number(tafel),
        videoId: entry.videoId,
        tournamentId: rec.tournamentId,
        tournamentName: rec.name || '',
        reden: entry.autoGekoppeld
          ? `losse uitzending was al aan dit toernooi gekoppeld maar begon te vroeg; "${rec.name || 'toernooi'}" krijgt een schone tafel`
          : entry.adhoc || entry.tournamentId == null
            ? `losse uitzending stond nog open; "${rec.name || 'toernooi'}" begint zo op deze tafel`
            : `uitzending van een ander toernooi stond nog open; "${rec.name || 'toernooi'}" begint zo op deze tafel`,
      });
    }
  }
  return uit;
}

module.exports = { vrijTeMaken, STANDAARD_MINUTEN_VOOR, zaalDagVan: zaalDag };
