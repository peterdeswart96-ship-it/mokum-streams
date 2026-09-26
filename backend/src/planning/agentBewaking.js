// Pure logica voor het alarm als de agent (OBS-pc) zwijgt (#132). Géén netwerk/opslag →
// volledig unit-testbaar.
//
// Aanleiding 17-09: de OBS-pc viel om 02:16 weg en dat werd pas om 10:00 ontdekt, omdat er
// toevallig iemand op het dashboard keek. De hartslag bestond al (agent/heartbeat.json), maar
// niemand kreeg een melding. Dit besluit bepaalt per minuut: alarmeren, herstel melden of niets.
//
// - Eenmalig per uitval: onthouden via `alarmVoorLastSeen` (het contactmoment waar het alarm
//   bij hoort), zodat het niet elke minuut opnieuw afgaat.
// - Herstelmelding zodra de agent terug is, alleen als er een alarm was.
// - Rustige uren: 's nachts heeft een pushmelding weinig zin als niemand wakker wordt. Een uitval
//   in dat venster wordt vastgehouden en pas gemeld zodra het venster afloopt (als de agent dan
//   nog steeds weg is), zodat het alarm er ligt vóór de zaal opengaat.

const STIL_MS = 10 * 60 * 1000; // zoveel minuten zwijgen voor het een uitval heet
// De wekelijkse herstart (ma/do 06:00) laat de agent ook even wegvallen; ruim binnen 10 min.
const RUSTIG_VAN_MIN = 60; // 01:00
const RUSTIG_TOT_MIN = 7 * 60; // 07:00

function inRustigeUren(minutenVanDeDag, { van = RUSTIG_VAN_MIN, tot = RUSTIG_TOT_MIN } = {}) {
  return minutenVanDeDag >= van && minutenVanDeDag < tot;
}

// heartbeat: { lastSeen: ISO } uit agent/heartbeat.json. staat: { alarmVoorLastSeen, alarmOm }
// uit agent/alarm.json (of {}). Geeft { actie, staat } terug; `staat` is de nieuwe waarde om te
// bewaren (of ongewijzigd). actie: 'geen' | 'alarm' | 'herstel'
function agentBewaking(heartbeat, staat, nowMs, minutenVanDeDag, {
  stilMs = STIL_MS, rustig = {},
} = {}) {
  const huidig = staat || {};
  const lastSeenMs = Date.parse((heartbeat && heartbeat.lastSeen) || '');
  // Nog nooit contact gehad: er valt niets te bewaken (verse omgeving, agent nog niet uitgerold).
  if (Number.isNaN(lastSeenMs)) return { actie: 'geen', staat: huidig };

  const stil = nowMs - lastSeenMs;

  if (stil < stilMs) {
    // Agent is er (weer). Was er een alarm, dan nu een herstelmelding en de staat leegmaken.
    if (huidig.alarmVoorLastSeen) {
      return { actie: 'herstel', staat: {}, sindsLastSeen: huidig.alarmVoorLastSeen, alarmOm: huidig.alarmOm || null };
    }
    return { actie: 'geen', staat: huidig };
  }

  // Agent zwijgt al langer dan de drempel.
  if (huidig.alarmVoorLastSeen === heartbeat.lastSeen) return { actie: 'geen', staat: huidig };
  if (inRustigeUren(minutenVanDeDag, rustig)) return { actie: 'geen', staat: huidig };
  return {
    actie: 'alarm',
    staat: { alarmVoorLastSeen: heartbeat.lastSeen, alarmOm: new Date(nowMs).toISOString() },
  };
}

module.exports = { agentBewaking, inRustigeUren, STIL_MS, RUSTIG_VAN_MIN, RUSTIG_TOT_MIN };
