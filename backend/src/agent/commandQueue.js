// Pure logica voor de agent-commandowachtrij (opslag: commands.json). De
// function-laag doet lezen/schrijven en id-/tijd-generatie. Géén netwerk → testbaar.

const GELDIGE_TYPES = new Set(['startStream', 'stopStream', 'setOverlay']);

// Standaard OBS-bronnamen voor de schakelbare overlays (zie docs/obs-standaard.md +
// api-contract v0.9/v0.11). Content-overlays staan standaard aan; break-overlays
// (Jumbotron/Pauzemelding, zie OVERLAY_DEFAULT_OFF) standaard uit. Per broadcast/live
// te toggelen vanuit het dashboard. 'Camera Tafel N' staat altijd aan (geen schakelaar).
const OVERLAY_BRON = {
  sponsors: 'Sponsor slideshow',
  scoreboard: 'Scoreboard',
  cuescoreLogo: 'Cuescore logo',
  jumbotron: 'Jumbotron',
  pauzemelding: 'Pauzemelding',
};
// NB: 'scoresOtherTables' (bron 'Scores other tables') is per 2026-07-13 verwijderd — de
// officiële Cuescore-scoreboard-overlay dekt dit. Terug te zetten door de sleutel hier +
// in agent DEFAULT_OVERLAY_SOURCES + frontend OVERLAYS weer toe te voegen én de OBS-bron.

// Break-overlays staan standaard UIT: ze horen alleen tijdens een pauze in beeld
// (Jumbotron = alle scores, Pauzemelding = "we wachten op de volgende wedstrijd").
const OVERLAY_DEFAULT_OFF = new Set(['jumbotron', 'pauzemelding']);

// Bouwt de commando's om een tafel te starten: OBS laten zenden + elke overlay op de
// gewenste stand zetten. Standaard aan, behalve break-overlays (OVERLAY_DEFAULT_OFF);
// een expliciete boolean in record.overlays wint altijd. Itereert over overlayBron zodat
// een extra overlay alleen daar hoeft te worden toegevoegd. Zonder id/tijd — die voegt
// de function-laag toe.
function startCommandsFor(record, tableNumber, overlayBron = OVERLAY_BRON) {
  const ov = (record && record.overlays) || {};
  return [
    { type: 'startStream', tableNumber },
    ...Object.entries(overlayBron).map(([sleutel, sourceName]) => ({
      type: 'setOverlay',
      tableNumber,
      sourceName,
      enabled: typeof ov[sleutel] === 'boolean' ? ov[sleutel] : !OVERLAY_DEFAULT_OFF.has(sleutel),
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
