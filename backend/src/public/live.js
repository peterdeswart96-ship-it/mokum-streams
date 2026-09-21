const { zaalDelen } = require('../schedule/schedule');
const { toernooiVoorNiveau } = require('../mokumCompetitie/toernooien');
const { competitieWachtMs } = require('../config/automation');

// Competitie-info van een actieve competitiestream (#147), voor het competitiescherm: welke
// competitie (Cuescore-toernooi) en welke wedstrijd die tafel toont. null bij elke andere
// stream, of als het niveau niet in toernooien.js staat (dan valt er niets te tonen).
// stopOm = wanneer checkStops de stream stopt (klaarSinds + wachttijd); de pagina toont het
// bedankscherm vlak daarvoor. checkStops tikt eens per minuut, dus de echte stop valt
// tussen stopOm en een minuut later.
function competitieVan(entry, wachtMs = competitieWachtMs()) {
  if (!entry || entry.stopped || entry.streamType !== 'competitie') return null;
  const toernooiId = toernooiVoorNiveau(entry.niveau);
  if (!toernooiId) return null;
  const klaarMs = Date.parse(entry.competitieKlaarSinds || '');
  return {
    stopOm: Number.isNaN(klaarMs) ? null : new Date(klaarMs + wachtMs).toISOString(),
    niveau: entry.niveau,
    toernooiId,
    matchId: entry.matchId != null ? Number(entry.matchId) : null,
    thuisteam: entry.thuisteam || null,
    uitteam: entry.uitteam || null,
    klaarSinds: entry.competitieKlaarSinds || null,
  };
}

// Camera-alarm uit de agent-status (A3 pre-flight + A2 freeze-watchdog): geeft het
// dashboard een waarschuwing als een automatische start werd uitgesteld omdat de camera
// niet live is, of als de camera bevroor tijdens een stream. null = niks aan de hand.
function cameraAlarmVan(s) {
  if (!s) return null;
  if (s.preflightFailed) {
    return { type: 'preflight', reason: s.preflightReason || 'camera niet live', recovered: false };
  }
  if (s.cameraFrozen) {
    return { type: 'frozen', reason: s.cameraReason || 'camera bevroren', recovered: !!s.cameraRecovered };
  }
  return null;
}

// Pure opbouw van de publieke antwoorden (/api/live + /api/schedule). Géén
// netwerk/opslag → unit-testbaar. Zie docs/api-contract.md.

// Per cameratafel de live-status: 'live' als de agent meldt dat er gezonden wordt,
// 'scheduled' als er vandaag een broadcast klaarstaat, anders 'offline'. Een
// gestopte entry (stopped: true) telt niet meer als actief → weer 'offline'.
// Voor een live tafel geven we ook de door de agent gemelde kwaliteit (resolutie/
// fps/bitrate) en de werkelijke overlay-standen door; anders zijn die `null`. Daarnaast
// `match`: de huidige Cuescore-wedstrijd op die tafel (uit liveMatches, timer liveMatches)
// — los van onze eigen broadcast-status, zodat het dashboard ook toont wat er speelt
// terwijl streams handmatig lopen.
// `liveVideoId`: het YouTube-videoId van de nu-actieve stream op die tafel (uit
// live-videos.json, timer liveVideos) — óók voor handmatig gestarte streams, zodat
// het dashboard de echte stream kan embedden ongeacht onze eigen broadcast-status.
function buildLiveTables(cameraTables, store, status, liveMatches, liveVideos) {
  const statusByTable = new Map(
    (((status && status.tables) || [])).map((t) => [Number(t.tableNumber), t])
  );
  const matches = (liveMatches && liveMatches.matches) || {};
  const videos = (liveVideos && liveVideos.videos) || {};
  return (cameraTables || []).map((nr) => {
    const b = (store || {})[String(nr)] || null;
    const actief = !!(b && !b.stopped);
    const s = statusByTable.get(Number(nr)) || null;
    const streaming = !!(s && s.streaming);
    // live-videos.json: nieuw = { videoId, visibility }; oud = videoId-string (compat).
    const rawVid = videos[String(nr)];
    const liveVideoId = typeof rawVid === 'string' ? rawVid : (rawVid && rawVid.videoId) || null;
    const liveVisibility = rawVid && typeof rawVid === 'object' ? rawVid.visibility || null : null;
    // Status: de store-entry (actief) is leidend zolang er niets tegenspreekt. Maar meldt de
    // agent 'streaming' of heeft YouTube een actieve broadcast (liveVideoId), dan is de tafel
    // 'live' (en dus stopbaar) — ongeacht wat de store zegt. Dat dekt twee gevallen af: géén
    // store-entry (een stream die over middernacht heen uit de dag-store rolde, v0.26) én een
    // entry die al op stopped staat terwijl de stream gewoon doorloopt (#148, 21-09: de stop
    // bereikte OBS niet, waarna een verborgen stream bijna een uur onzichtbaar doorzond).
    // Kort gezegd: de werkelijkheid wint van de administratie.
    const echtLive = streaming || !!liveVideoId;
    let st = 'offline';
    if (actief) st = streaming ? 'live' : 'scheduled';
    else if (echtLive) st = 'live'; // gestopt of uit de store gerold, maar wél in de lucht
    // Kwaliteit + overlays zodra de agent streaming meldt (los van de store-datum).
    const quality = streaming
      ? { resolution: s.resolution || null, fps: s.fps ?? null, bitrateKbps: s.bitrateKbps ?? null }
      : null;
    const overlays = streaming && s.overlays ? s.overlays : null;
    return {
      tableNumber: Number(nr),
      status: st,
      videoId: (actief && b.videoId) || (st === 'live' ? liveVideoId : null),
      title: actief ? b.title || null : null,
      scheduledStart: actief ? b.scheduledStart || null : null,
      tournamentName: actief ? b.tournamentName || null : null,
      quality,
      overlays,
      match: matches[String(nr)] || null,
      liveVideoId,
      liveVisibility,
      cameraAlarm: cameraAlarmVan(s),
      competitie: competitieVan(b),
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

module.exports = { buildLiveTables, buildSchedule, competitieVan };
