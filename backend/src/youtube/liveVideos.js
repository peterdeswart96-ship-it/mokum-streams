// Pure koppeling van live YouTube-broadcasts aan cameratafels op basis van de
// titel ("Tafel {nr} ..."). Géén netwerk → unit-testbaar. De netwerk-call
// (listActiveBroadcasts) en opslag zitten in de timer-Function.

// Haalt het tafelnummer uit een broadcast-titel "Tafel {nr} ...". Null als geen match.
function parseTafelUitTitel(title) {
  const m = /^\s*Tafel\s+(\d+)\b/i.exec(String(title || ''));
  return m ? Number(m[1]) : null;
}

// Koppelt actieve broadcasts ([{ videoId, title }]) aan cameratafels →
// { "<tafelnr>": videoId }. Alleen tafels in cameraTables; bij meerdere matches op
// dezelfde tafel wint de eerste.
function koppelVideosAanTafels(broadcasts, cameraTables) {
  const set = new Set((cameraTables || []).map(Number));
  const uit = {};
  for (const b of broadcasts || []) {
    const tn = parseTafelUitTitel(b && b.title);
    if (tn != null && set.has(tn) && uit[String(tn)] == null && b.videoId) {
      uit[String(tn)] = b.videoId;
    }
  }
  return uit;
}

module.exports = { parseTafelUitTitel, koppelVideosAanTafels };
