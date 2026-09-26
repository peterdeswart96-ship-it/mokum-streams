// Pure logica voor de live-bevestiging aan de YouTube-kant (#131). Géén netwerk/opslag →
// volledig unit-testbaar.
//
// Het probleem (16-09): tafel 3 kreeg nooit beeld. OBS zond keurig (de agent meldde
// `streaming: true`), maar YouTube zette de nieuwe broadcast nooit live — hij bleef op
// "Upcoming" staan omdat de stream key al actief was toen de broadcast eraan gebonden werd.
// Het herstart-vangnet (#114) en het alarm (12-09) kijken alleen naar wat de AGENT meldt,
// dus geen van beide sloeg aan. Zwart beeld tot iemand het na uren zelf zag.
//
// Deze check toetst daarom aan de YouTube-kant: heeft de video een `actualStartTime`? Zo niet,
// dan is de uitzending een tijd na de geplande start nog niet echt live, wat de agent ook meldt.
// We alarmeren alleen (geen automatische actie): een herstart terwijl OBS wél zendt kan een
// werkende uitzending verstoren, dus dat besluit is aan een mens.

const MARGE_MS = 10 * 60 * 1000; // ruim na het herstart-vangnet (#114: 2 min + 3 pogingen)
const MAX_LEEFTIJD_MS = 12 * 3600 * 1000; // oudere registraties zijn geen lopende uitzending meer

// Moet er nu bij YouTube gekeken worden? Alleen zolang we niet weten dat de uitzending live is
// en er nog niet gealarmeerd is: zo kost het per uitzending hooguit een paar aanroepen
// (videos.list = 1 quota-eenheid), niet elke minuut de hele avond.
// streamt: meldt de agent dat deze tafel zendt? Zo niet, dan is dat het domein van #114.
function moetLiveControleren(entry, streamt, nowMs, { margeMs = MARGE_MS, maxLeeftijdMs = MAX_LEEFTIJD_MS } = {}) {
  if (!entry || !streamt) return false;
  if (entry.stopped || entry.finalized) return false;
  if (!entry.videoId) return false;
  if (entry.ytLiveBevestigd || entry.ytAlertVerstuurd) return false;
  const start = Date.parse(entry.scheduledStart || '');
  if (Number.isNaN(start)) return false;
  const sindsStart = nowMs - start;
  return sindsStart >= margeMs && sindsStart <= maxLeeftijdMs;
}

// details: uitkomst van getVideoDetails() (met actualStartTime), of null als de video niet
// gevonden is. Geeft { actie, patch }: 'live' | 'alarm'. Bij twijfel (video onvindbaar) doen
// we niets — een gemiste melding is beter dan een vals alarm midden in een uitzending.
function beoordeelLive(entry, details) {
  if (!details) return { actie: 'geen', patch: {} };
  if (details.actualStartTime) return { actie: 'live', patch: { ytLiveBevestigd: true } };
  return { actie: 'alarm', patch: { ytAlertVerstuurd: true } };
}

module.exports = { moetLiveControleren, beoordeelLive, MARGE_MS, MAX_LEEFTIJD_MS };
