// Pure logica voor het automatische pauzescherm (A auto-trigger, zie
// docs/pauzescherm-auto.md). Géén netwerk/opslag → volledig unit-testbaar.
// De timer-Function (functions/pauzeScherm.js) doet de fetch + opslag + enqueue.

const { findTableMatch } = require('../cuescore/parse');

// Speelt er NU een wedstrijd op deze tafel? Zoekt over alle (genormaliseerde)
// toernooien van vandaag naar een lopende match op het tafelnummer.
function tafelSpeeltNu(tournaments, tableNumber) {
  for (const t of tournaments || []) {
    if (findTableMatch(t, tableNumber, { onlyPlaying: true })) return true;
  }
  return false;
}

// Toestandsmachine per tafel met debounce en fail-safe.
//   vorige     : { toestand: 'spelen'|'pauze', sinds: ms, wachtSinds: ms|null } | null
//   speeltNu   : boolean (uit tafelSpeeltNu)
//   nowMs      : wandklok in ms
//   debounceMs : hoe lang 'geen wedstrijd' moet aanhouden vóór we naar 'pauze' gaan
// Regels:
//   - Zodra er een wedstrijd speelt → direct 'spelen' (pauzescherm uit), geen debounce.
//   - Geen wedstrijd → pas naar 'pauze' (pauzescherm aan) nadat het `debounceMs`
//     aaneengesloten 'geen wedstrijd' is (voorkomt flapperen bij rackwissels/laden).
// Retour: { toestand, sinds, wachtSinds, veranderd } — `veranderd` = of de toestand
// nu omslaat (dan moet de caller de overlays (om)schakelen).
function volgendeToestand(vorige, speeltNu, nowMs, debounceMs) {
  const prev = vorige || { toestand: 'spelen', sinds: nowMs, wachtSinds: null };

  if (speeltNu) {
    if (prev.toestand !== 'spelen') {
      return { toestand: 'spelen', sinds: nowMs, wachtSinds: null, veranderd: true };
    }
    return { toestand: 'spelen', sinds: prev.sinds, wachtSinds: null, veranderd: false };
  }

  // Geen wedstrijd:
  if (prev.toestand === 'pauze') {
    return { toestand: 'pauze', sinds: prev.sinds, wachtSinds: null, veranderd: false };
  }
  // prev = 'spelen' → debounce voordat we naar 'pauze' gaan.
  const wachtSinds = prev.wachtSinds != null ? prev.wachtSinds : nowMs;
  if (nowMs - wachtSinds >= debounceMs) {
    return { toestand: 'pauze', sinds: nowMs, wachtSinds: null, veranderd: true };
  }
  return { toestand: 'spelen', sinds: prev.sinds, wachtSinds, veranderd: false };
}

// Bouwt per cameratafel de "huidige wedstrijd" voor weergave in het dashboard
// (read-only). Kiest bij voorkeur een lopende (playing) wedstrijd; anders de laatst
// gevonden wedstrijd op die tafel. Retour: { [tafelnr]: {playerA, playerB, scoreA,
// scoreB, status, round} | null }.
function bouwLiveMatches(tournaments, cameraTables) {
  const uit = {};
  for (const tn of cameraTables || []) {
    let gevonden = null;
    for (const t of tournaments || []) {
      const m = findTableMatch(t, tn, { onlyPlaying: false });
      if (m && m.status === 'playing') { gevonden = m; break; } // lopende wint altijd
      if (m && !gevonden) gevonden = m; // anders de eerst-gevondene onthouden
    }
    uit[String(tn)] = gevonden
      ? {
          playerA: gevonden.playerA ? gevonden.playerA.name : null,
          playerB: gevonden.playerB ? gevonden.playerB.name : null,
          scoreA: gevonden.scoreA != null ? gevonden.scoreA : null,
          scoreB: gevonden.scoreB != null ? gevonden.scoreB : null,
          status: gevonden.status || null,
          round: gevonden.roundName || null,
        }
      : null;
  }
  return uit;
}

// Bouwt de setOverlay-commando's (zonder id/tijd) om het pauzescherm aan of uit te
// zetten: de opgegeven pauze-overlaysleutels op `toonPauze`. Slaat sleutels over die
// niet in overlayBron staan.
function pauzeCommandos(tableNumber, toonPauze, overlayBron, keys) {
  return (keys || [])
    .filter((k) => overlayBron && overlayBron[k])
    .map((k) => ({ type: 'setOverlay', tableNumber: Number(tableNumber), sourceName: overlayBron[k], enabled: !!toonPauze }));
}

module.exports = { tafelSpeeltNu, volgendeToestand, pauzeCommandos, bouwLiveMatches };
