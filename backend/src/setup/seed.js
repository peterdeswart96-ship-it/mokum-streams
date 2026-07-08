// Pure logica voor de eenmalige seed van herbruikbare stream keys per tafel.
// Bepaalt welke liveStreams hergebruikt kunnen worden (op titel) en welke nog
// aangemaakt moeten worden. Géén netwerk → unit-testbaar.

// Vaste titel per tafel, zodat de seed idempotent is (hergebruik op titel).
function streamTitle(tableNumber) {
  return `Mokum Streams — Tafel ${tableNumber}`;
}

// Verdeelt de camera-tafels in "hergebruiken" (er bestaat al een liveStream met
// de juiste titel) en "te maken".
function planLiveStreamSeed(existing, cameraTables) {
  const byTitle = new Map((existing || []).map((s) => [s.title, s]));
  const reuse = [];
  const teMaken = [];
  for (const nr of cameraTables || []) {
    const titel = streamTitle(nr);
    const gevonden = byTitle.get(titel);
    if (gevonden) reuse.push({ tableNumber: nr, streamId: gevonden.id });
    else teMaken.push({ tableNumber: nr, title: titel });
  }
  return { reuse, teMaken };
}

module.exports = { streamTitle, planLiveStreamSeed };
