// Detecteert of een tafel al een tijd geen wedstrijd meer heeft gehad, ONAFHANKELIJK van
// welk toernooi daarbij hoort. Nodig voor twee gevallen die zonder dit nooit vanzelf
// stoppen:
//
//   - een losse (ad-hoc) uitzending die nooit aan een toernooi gekoppeld kon worden (#100).
//     Vier vergeten challenge-streams van 8-11 uur op 09-08 kwamen hierdoor.
//   - een gekoppelde uitzending waarvan het toernooi bij Cuescore leeg terugkomt (#105).
//     Op 16-08 had Cuescore de wedstrijddata van het koppeltoernooi op een ANDER
//     toernooi-ID staan dan waar wij aan gekoppeld waren — de gekoppelde ID gaf altijd
//     0 wedstrijden terug, dus `toernooiKlaar()` kon nooit `true` worden.
//
// Bron: `venueTables` uit live-matches.json (bouwZaalRaster in planning/pauze.js) — die
// kijkt over ALLE toernooien van vandaag heen, dus onafhankelijk van welk specifiek
// toernooi-ID bij déze uitzending hoort. Precies de tafelgebaseerde blik die op 16-08 de
// live-scores en uiteindelijk ook het podium wél liet kloppen, terwijl de toernooi-
// specifieke stop-logica vastliep.

// Besluit Peter (09-08): een uur stilte op de tafel is de grens.
const GRENS_MS_STANDAARD = 60 * 60 * 1000;

// Speelt er nu iets op deze tafel, over alle toernooien van vandaag heen?
function tafelIsActief(venueTables, tableNumber) {
  const rij = (venueTables || []).find((t) => Number(t && t.table) === Number(tableNumber));
  return !!(rij && String(rij.status || '').toLowerCase() === 'playing');
}

// entry: de broadcast-entry (leest evt. `laatsteActiviteit`, valt terug op `scheduledStart`).
// Retour: { actief, laatsteActiviteit, moetStoppen }.
//   - actief         : speelt er nu iets op deze tafel?
//   - laatsteActiviteit: bijgewerkte stempel — nu, als actief; anders ongewijzigd. De
//     caller schrijft dit terug op de entry, zodat de stilte-duur stabiel blijft tussen
//     twee ronden (niet elke minuut opnieuw vanaf nu tellen).
//   - moetStoppen    : is de tafel >= grensMs onafgebroken stil?
// Bewust GEEN netwerk/opslag hier — de caller (checkStops) haalt venueTables op en
// respecteert zelf wedstrijdSpeelt()/adhoc-regels eromheen.
function inactiviteitsCheck(entry, venueTables, now, { grensMs = GRENS_MS_STANDAARD } = {}) {
  const tableNumber = entry && entry.tableNumber;
  const actief = tafelIsActief(venueTables, tableNumber);
  if (actief) return { actief: true, laatsteActiviteit: now.toISOString(), moetStoppen: false };

  // Nog nooit activiteit gezien? Reken vanaf de start van de uitzending, anders blijft een
  // stream die per ongeluk op een lege tafel begon voor altijd staan (#100).
  const referentie = (entry && entry.laatsteActiviteit) || (entry && entry.scheduledStart);
  const sindsMs = referentie ? Date.parse(referentie) : NaN;
  if (Number.isNaN(sindsMs)) {
    return { actief: false, laatsteActiviteit: (entry && entry.laatsteActiviteit) || null, moetStoppen: false };
  }
  const stilMs = now.getTime() - sindsMs;
  return {
    actief: false,
    laatsteActiviteit: (entry && entry.laatsteActiviteit) || null,
    moetStoppen: stilMs >= grensMs,
  };
}

module.exports = { tafelIsActief, inactiviteitsCheck, GRENS_MS_STANDAARD };
