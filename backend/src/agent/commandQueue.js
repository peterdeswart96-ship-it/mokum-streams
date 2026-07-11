// Pure logica voor de agent-commandowachtrij (opslag: commands.json). De
// function-laag doet lezen/schrijven en id-/tijd-generatie. Géén netwerk → testbaar.

const GELDIGE_TYPES = new Set(['startStream', 'stopStream', 'setOverlay']);

// Standaard OBS-bronnamen voor de 4 schakelbare overlays na standaardisatie van
// alle 4 instanties (zie docs/obs-standaard.md + api-contract v0.9). Alle vier zijn
// per broadcast/live te toggelen vanuit het dashboard. 'Camera Tafel N' staat altijd
// aan (geen schakelaar). Per tafel te overrijden via config/tables.json (overlaySources).
const OVERLAY_BRON = {
  sponsors: 'Sponsor slideshow',
  scoreboard: 'Scoreboard',
  scoresOtherTables: 'Scores other tables',
  cuescoreLogo: 'Cuescore logo',
};

// Bouwt de commando's om een tafel te starten: OBS laten zenden + elke overlay op de
// gewenste stand zetten (standaard aan, tenzij expliciet false in record.overlays).
// Itereert over overlayBron zodat een extra overlay alleen daar hoeft te worden
// toegevoegd. Zonder id/tijd — die voegt de function-laag toe.
function startCommandsFor(record, tableNumber, overlayBron = OVERLAY_BRON) {
  const ov = (record && record.overlays) || {};
  return [
    { type: 'startStream', tableNumber },
    ...Object.entries(overlayBron).map(([sleutel, sourceName]) => ({
      type: 'setOverlay', tableNumber, sourceName, enabled: ov[sleutel] !== false,
    })),
  ];
}

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

// Is een tafel vandaag al bezet? Een entry telt alleen als bezet zolang 'ie niet
// gestopt is — een gestopte/afgelopen stream geeft de camera weer vrij.
function isTableBusy(broadcastsStore, tableNumber) {
  const s = broadcastsStore || {};
  const entry = s[String(tableNumber)] || s[tableNumber];
  return !!(entry && !entry.stopped);
}

module.exports = { GELDIGE_TYPES, OVERLAY_BRON, startCommandsFor, removeProcessed, enqueue, isTableBusy };
