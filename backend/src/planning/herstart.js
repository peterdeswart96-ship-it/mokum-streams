// Pure logica voor het automatisch herstarten van een stream die niet vanzelf aansloeg
// (#114). Géén netwerk/opslag → volledig unit-testbaar.
//
// Geconstateerd 26-08 (gecontroleerde test): een vers aangemaakte/gebonden YouTube-
// broadcast blijkt een korte tijd nodig te hebben voordat 'ie binnenkomende RTMP-data
// accepteert. De allereerste StartStream-poging (vlak na het aanmaken, via de agent)
// kan daardoor stil mislukken — de agent meldt geen fout, maar OBS gaat niet écht
// zenden. Een tweede poging een tijdje later lukte in de test wél, puur door te wachten.
//
// Dit vangnet herkent een tafel die allang had moeten zenden (scheduledStart ligt ver
// genoeg terug) maar dat volgens de agent-status niet doet, en stuurt automatisch een
// vers startStream-commando — zonder dat iemand hoeft in te grijpen. Begrensd op een
// paar pogingen met een minimale tussenpoos, zodat een structureel probleem (zoals het
// aparte stopStream-mysterie) niet tot een oneindige spervuur aan commando's leidt.

const MAX_POGINGEN = 3;
const MARGE_MS = 2 * 60 * 1000; // pas ingrijpen als de geplande start al 2 min. voorbij is
const HERPOGING_MS = 2 * 60 * 1000; // niet vaker dan om de 2 minuten opnieuw proberen

// entry: de broadcasts-store-entry voor deze tafel (met scheduledStart, stopped,
// startPogingen, laatsteStartPoging). streamt: meldt de agent (status.json) dat deze
// tafel nu daadwerkelijk zendt?
function moetOpnieuwStarten(entry, streamt, nowMs, {
  margeMs = MARGE_MS, herpogingMs = HERPOGING_MS, maxPogingen = MAX_POGINGEN,
} = {}) {
  if (!entry || entry.stopped || streamt) return false;
  const start = Date.parse(entry.scheduledStart || '');
  if (Number.isNaN(start)) return false;
  if (nowMs - start < margeMs) return false; // nog binnen de normale opstarttijd
  const pogingen = Number(entry.startPogingen) || 0;
  if (pogingen >= maxPogingen) return false; // vangnet: niet oneindig blijven proberen
  const laatste = Date.parse(entry.laatsteStartPoging || '') || 0;
  if (nowMs - laatste < herpogingMs) return false;
  return true;
}

module.exports = { moetOpnieuwStarten, MAX_POGINGEN, MARGE_MS, HERPOGING_MS };
