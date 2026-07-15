// Pure logica voor de nachtelijke veiligheids-stop: na sluitingstijd worden ALLE
// nog-lopende streams (ook handmatige/adhoc) gestopt, zodat er nooit iets 's nachts
// blijft doorzenden (bevroren beeld / ongestopte stream). Géén netwerk → testbaar.

// Zit `minutenVanDeDag` (Amsterdam) in het nachtvenster [sluiting, ochtend)?
// Default: 02:00 (120) t/m 08:00 (480) — ná die tijd geen daglicht-streams meer raken.
function isNachtVenster(minutenVanDeDag, { sluiting = 120, ochtend = 480 } = {}) {
  return minutenVanDeDag >= sluiting && minutenVanDeDag < ochtend;
}

// Tafelnummers in een broadcasts-store die nog niet gestopt zijn (dus nu te stoppen).
// I.t.t. de gewone checkStops nemen we hier bewust ÓÓK adhoc (handmatige) streams mee.
function teStoppenNachts(store) {
  const s = store || {};
  const out = [];
  for (const k of Object.keys(s)) {
    const e = s[k];
    if (e && !e.stopped) {
      const n = Number(e.tableNumber != null ? e.tableNumber : k);
      if (Number.isInteger(n)) out.push(n);
    }
  }
  return out;
}

module.exports = { isNachtVenster, teStoppenNachts };
