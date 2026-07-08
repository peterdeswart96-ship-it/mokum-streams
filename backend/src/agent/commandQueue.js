// Pure logica voor de agent-commandowachtrij (opslag: commands.json). De
// function-laag doet lezen/schrijven en id-/tijd-generatie. Géén netwerk → testbaar.

const GELDIGE_TYPES = new Set(['startStream', 'stopStream', 'setOverlay']);

// Verwijdert de commando's die de agent als verwerkt heeft bevestigd.
function removeProcessed(commands, verwerkteIds) {
  const set = new Set(verwerkteIds || []);
  return (commands || []).filter((c) => !set.has(c.id));
}

// Voegt één of meer commando's achteraan de wachtrij toe.
function enqueue(commands, nieuwe) {
  const lijst = Array.isArray(nieuwe) ? nieuwe : [nieuwe];
  return [...(commands || []), ...lijst];
}

// Is een tafel vandaag al bezet? (er staat al een broadcast in de dagstore)
function isTableBusy(broadcastsStore, tableNumber) {
  const s = broadcastsStore || {};
  return !!(s[String(tableNumber)] || s[tableNumber]);
}

module.exports = { GELDIGE_TYPES, removeProcessed, enqueue, isTableBusy };
