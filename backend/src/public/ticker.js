// Pure logica voor de ticker onderin het pauzescherm (#65). Géén netwerk/opslag → testbaar.
//
// De ticker is een vrije berichtenbalk: aankondigingen, sponsors, wat er die avond speelt.
// Bewust GEEN scores — die staan al in de tafelkaarten van de jumbotron (besluit 22-07).
// Staat er niets ingesteld, dan tonen we één standaardregel zodat de balk nooit leeg is.

const STANDAARD_TICKER = 'Waiting for next match...';

const MAX_REGELS = 20;   // meer past niet zinnig in één omloop
const MAX_LENGTE = 200;  // per regel; langer leest niemand op een scherm

// Maakt van ruwe invoer (array, of één string met regeleindes) een nette lijst:
// trimmen, dubbele spaties weg, lege regels weg, en begrensd in aantal en lengte.
function normaliseerTicker(invoer) {
  const rauw = Array.isArray(invoer)
    ? invoer
    : String(invoer == null ? '' : invoer).split(/\r?\n/);
  const uit = [];
  for (const r of rauw) {
    const regel = String(r == null ? '' : r).replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTE);
    if (regel) uit.push(regel);
    if (uit.length >= MAX_REGELS) break;
  }
  return uit;
}

// Wat de overlay moet tonen: de ingestelde regels, of de standaardregel als er niets staat.
function tickerVoorUitzending(opgeslagen) {
  const regels = normaliseerTicker(opgeslagen);
  return regels.length ? regels : [STANDAARD_TICKER];
}

module.exports = { normaliseerTicker, tickerVoorUitzending, STANDAARD_TICKER, MAX_REGELS, MAX_LENGTE };
