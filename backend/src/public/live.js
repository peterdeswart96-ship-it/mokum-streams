const { zaalDelen } = require('../schedule/schedule');

// Pure opbouw van de publieke antwoorden (/api/live + /api/schedule). Géén
// netwerk/opslag → unit-testbaar. Zie docs/api-contract.md.

// Per cameratafel de live-status: 'live' als de agent meldt dat er gezonden wordt,
// 'scheduled' als er vandaag een broadcast klaarstaat, anders 'offline'. Een
// gestopte entry (stopped: true) telt niet meer als actief → weer 'offline'.
// Voor een live tafel geven we ook de door de agent gemelde kwaliteit (resolutie/
// fps/bitrate) en de werkelijke overlay-standen door; anders zijn die `null`.
function buildLiveTables(cameraTables, store, status) {
  const statusByTable = new Map(
    (((status && status.tables) || [])).map((t) => [Number(t.tableNumber), t])
  );
  return (cameraTables || []).map((nr) => {
    const b = (store || {})[String(nr)] || null;
    const actief = !!(b && !b.stopped);
    const s = statusByTable.get(Number(nr)) || null;
    const streaming = !!(s && s.streaming);
    let st = 'offline';
    if (actief) st = streaming ? 'live' : 'scheduled';
    // Kwaliteit + overlays alleen als de tafel echt live is (anders stale/irrelevant).
    const quality =
      streaming && actief
        ? { resolution: s.resolution || null, fps: s.fps ?? null, bitrateKbps: s.bitrateKbps ?? null }
        : null;
    const overlays = streaming && actief && s.overlays ? s.overlays : null;
    return {
      tableNumber: Number(nr),
      status: st,
      videoId: actief ? b.videoId || null : null,
      title: actief ? b.title || null : null,
      scheduledStart: actief ? b.scheduledStart || null : null,
      tournamentName: actief ? b.tournamentName || null : null,
      quality,
      overlays,
    };
  });
}

// Publiek schema: aankomende (enabled) enkeldaagse toernooien binnen `days`.
// Leagues (doorlopend) worden hier nog niet getoond (per-avond, later).
function buildSchedule(planning, now, days = 7) {
  const vandaag = zaalDelen(now).datum;
  const grens = new Date(`${vandaag}T00:00:00Z`);
  grens.setUTCDate(grens.getUTCDate() + days);
  const grensISO = grens.toISOString().slice(0, 10);

  const items = [];
  for (const r of planning || []) {
    if (r.enabled === false || r.type === 'competition') continue;
    const startIso = r.startOverride || r.plannedStart;
    if (!startIso) continue;
    const d = new Date(startIso);
    if (Number.isNaN(d.getTime())) continue;
    const { datum, minutenVanDeDag } = zaalDelen(d);
    if (datum < vandaag || datum > grensISO) continue;
    const uur = String(Math.floor(minutenVanDeDag / 60)).padStart(2, '0');
    const min = String(minutenVanDeDag % 60).padStart(2, '0');
    items.push({
      date: datum,
      startTime: `${uur}:${min}`,
      tournamentName: r.name || '',
      tableNumbers: (r.tafels || []).slice(),
    });
  }
  items.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return items;
}

module.exports = { buildLiveTables, buildSchedule };
