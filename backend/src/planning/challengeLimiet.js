// Harde tijdslimiet voor challenge-streams: na 2 uur stoppen, ONGEACHT of er nog gespeeld
// wordt. Besluit Peter i.o.m. Nick (18-08): een challenge is een losse partij zonder
// Cuescore-toernooikoppeling (#88 lost dat nog niet op), dus de gewone "nooit stoppen
// terwijl er gespeeld wordt"-regel (wedstrijdSpeelt, zie planning/stop.js) en het
// inactiviteits-vangnet (#100) helpen hier niet: een partij die gewoon dóórspeelt zou
// anders eindeloos blijven staan. De 2-uurslimiet legt de verantwoordelijkheid bij de
// spelers: duurt de partij langer, dan vragen ze zelf om een nieuwe stream (deel 2, 3...).
// De wizard waarschuwt daar bij het aanmaken al voor (frontend/src/App.jsx).
//
// Bewust een APARTE, expliciete regel i.p.v. inactiviteitsCheck() hergebruiken: die gaat
// over stilte op de tafel, dit gaat over verstreken tijd sinds de start — twee andere
// vragen, ook al lijken de vangnetten op elkaar.

const CHALLENGE_LIMIET_MS_STANDAARD = 2 * 60 * 60 * 1000; // 2 uur

// entry: de broadcast-entry. Retour: true als dit een challenge is die zijn tijdslimiet
// heeft bereikt (en dus gestopt moet worden, ongeacht wedstrijdstatus).
function challengeMoetStoppen(entry, now, { limietMs = CHALLENGE_LIMIET_MS_STANDAARD } = {}) {
  if (!entry || entry.stopped) return false;
  if (entry.streamType !== 'challenge') return false;
  const start = Date.parse(entry.scheduledStart || '');
  if (Number.isNaN(start)) return false;
  return (now.getTime() - start) >= limietMs;
}

module.exports = { challengeMoetStoppen, CHALLENGE_LIMIET_MS_STANDAARD };
