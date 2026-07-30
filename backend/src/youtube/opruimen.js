// Welke oude broadcasts blokkeren de stream key van een tafel? (#78) Pure logica → testbaar.
//
// Aanleiding (28-07): elke tafel heeft één vaste, herbruikbare stream key. Bij elke start
// maken we een nieuwe broadcast en koppelen die aan de key, waarna YouTube 'm via
// enableAutoStart vanzelf live zet zodra er beeld binnenkomt. Maar YouTube kiest zélf
// welke van de gekoppelde broadcasts hij oppakt, en dat is niet per se de nieuwste.
//
// Die avond hing er nog een broadcast van de vorige dag aan de key van tafel 1. Het
// camerabeeld belandde daardoor in die oude video, terwijl de nieuwe op 'Upcoming' bleef
// staan. Kijkers op de goede link zagen niets, en de thumbnail en hoofdstukken kwamen
// achteraf op een lege video terecht.
//
// Vandaar: vóór een start ruimen we op wat er nog aan de key hangt.
//
// Twee soorten, met een belangrijk verschil:
//  - 'live'  → AFSLUITEN. Hier zit beeld in; weggooien zou een opname vernietigen.
//  - anders  → VERWIJDEREN. Deze is nooit live geweest (created/ready/testing) en bevat
//              dus niets; afsluiten kan bij YouTube ook niet vanuit die toestand.

const NOOIT_LIVE_GEWEEST = new Set(['created', 'ready', 'testing']);

// broadcasts: [{ videoId, title, status, boundStreamId }] — status = lifeCycleStatus.
// behoudId: een broadcast die je juist wilt houden (bijv. degene die je net aanmaakte).
// Retour: [{ videoId, actie: 'afsluiten' | 'verwijderen', titel, status }]
function opruimActies(broadcasts, streamId, behoudId = null) {
  if (!streamId) return []; // zonder key weten we niet wat erbij hoort → niets aanraken
  const uit = [];
  for (const b of broadcasts || []) {
    if (!b || !b.videoId) continue;
    if (behoudId && b.videoId === behoudId) continue;
    if (b.boundStreamId !== streamId) continue;

    const status = String(b.status || '').toLowerCase();
    if (status === 'live') {
      uit.push({ videoId: b.videoId, actie: 'afsluiten', titel: b.title || '', status });
    } else if (NOOIT_LIVE_GEWEEST.has(status)) {
      uit.push({ videoId: b.videoId, actie: 'verwijderen', titel: b.title || '', status });
    }
    // complete/revoked: al afgerond, blokkeert niets meer.
  }
  return uit;
}

module.exports = { opruimActies, NOOIT_LIVE_GEWEEST };
