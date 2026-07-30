// Wanneer geven we het afronden van een video op? (#80) Pure logica → unit-testbaar.
//
// Aanleiding: op 29-07 probeerde finalizeVideos 423 keer op één dag dezelfde video af
// te ronden — een broadcast die nooit live is geweest en later was verwijderd. Elke
// poging kost een YouTube-aanroep en één regel in de log, en de lus stopte alleen
// doordat de datum uiteindelijk buiten het venster van twee dagen viel.
//
// Twee redenen om te stoppen:
//  1. De fout is onherstelbaar (de video bestaat niet meer) → direct opgeven.
//  2. Het maximum aantal pogingen is bereikt → opgeven, en het in de log zetten als
//     iets dat aandacht vraagt. Handmatig afronden kan altijd nog via
//     POST /api/manage/finalize.
//
// Waarom niet oneindig doorproberen: een tijdelijke storing is binnen tien minuten
// voorbij; duurt het langer, dan is er iets anders aan de hand en moet een mens kijken.
// Blijven proberen verbergt dat juist.

const MAX_POGINGEN = Number(process.env.FINALIZE_MAX_POGINGEN) || 10;

// Fouten waarbij opnieuw proberen per definitie zinloos is.
const ONHERSTELBAAR = /niet gevonden|not found|404|verwijderd|deleted/i;

// Bepaalt wat er na een mislukte poging moet gebeuren.
// Retour: { pogingen, opgegeven, onherstelbaar, max }
function finalizeVervolg(entry, bericht, { max = MAX_POGINGEN } = {}) {
  const pogingen = (Number(entry && entry.finalizePogingen) || 0) + 1;
  const onherstelbaar = ONHERSTELBAAR.test(String(bericht || ''));
  return { pogingen, onherstelbaar, max, opgegeven: onherstelbaar || pogingen >= max };
}

module.exports = { finalizeVervolg, MAX_POGINGEN, ONHERSTELBAAR };
