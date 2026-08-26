// Pure logica voor het automatische pauzescherm (A auto-trigger, zie
// docs/pauzescherm-auto.md). Géén netwerk/opslag → volledig unit-testbaar.
// De timer-Function (functions/pauzeScherm.js) doet de fetch + opslag + enqueue.

const { findTableMatch } = require('../cuescore/parse');
const { zaalDag } = require('../schedule/schedule');
const { datumInZaal } = require('./league');

// Telt deze wedstrijd mee als "wat er nu op die tafel is"? (#86)
//
// Sinds de doorlopende league meekomt in de toernooien-van-vandaag, zitten er
// wedstrijden van weken terug in de data: de 14.1-league loopt van 16 juni tot
// 31 augustus en heeft 88 gespeelde partijen over zestien tafels. Zonder deze filter
// toonde het dashboard "Bob Walter vs Marieke de Boer" van 21 juni als de huidige stand
// op tafel 16, en vulde het zaalraster van het pauzescherm zich met oude partijen.
//
// Een LOPENDE wedstrijd telt altijd; een afgeronde alleen als 'ie van vandaag is.
function teltVoorVandaag(m, vandaag) {
  if (!m) return false;
  if (String(m.status || '').toLowerCase() === 'playing') return true;
  return !!m.start && datumInZaal(m.start) === vandaag;
}

// De meest relevante wedstrijd van vandaag op één tafel binnen één toernooi.
//
// Bewust niet via findTableMatch: die pakt "de laatste in de lijst" en filteren kan pas
// daarna, dus bij een league met tientallen partijen per tafel gooien we dan ook de
// partij van vandaag weg als die niet toevallig achteraan staat. Hier kiezen we eerst
// binnen wat vandaag telt: lopend wint, anders de laatst gestarte van vandaag.
function relevanteMatch(tournament, tableNumber, vandaag) {
  const t = String(tableNumber);
  const kandidaten = ((tournament && tournament.matches) || []).filter((m) => m.table === t);
  const speelt = kandidaten.find((m) => String(m.status || '').toLowerCase() === 'playing');
  if (speelt) return speelt;
  const vandaagse = kandidaten.filter((m) => teltVoorVandaag(m, vandaag));
  if (!vandaagse.length) return null;
  return vandaagse.reduce((a, b) => (Date.parse(b.start) >= Date.parse(a.start) ? b : a));
}

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
// spelenDebounceMs: hoelang het pauzescherm nog blijft staan nadat Cuescore een
// wedstrijd op de tafel meldt. Cuescore krijgt een tafel toegewezen zodra de loting
// het zegt, maar dan moeten de spelers er nog naartoe lopen, racken en inspelen —
// zonder wachttijd kijk je een paar minuten naar een lege tafel. Standaard 0 (direct),
// zodat bestaande aanroepen niets merken; pauzeScherm zet 'm op een minuut.
function volgendeToestand(vorige, speeltNu, nowMs, debounceMs, spelenDebounceMs = 0) {
  // Zonder eerdere staat (nieuwe tafel deze zaal-dag) starten we neutraal in PAUZE, niet
  // 'spelen': het pauzescherm hoort te draaien "tot de eerste bal valt" (avond-verloop in
  // CLAUDE.md), dus bij twijfel is pauze de veilige/bedoelde standaard. Ontdekt de eerstvolgende
  // tik dat er al gespeeld wordt, dan schakelt de normale spelenDebounce daar gewoon voor —
  // dat geeft ook meteen een actieve bevestiging (commando + log) i.p.v. stilzwijgend te
  // vertrouwen dat de allereerste jumbotron-AAN vanuit createBroadcasts wel is aangekomen
  // (geconstateerd 25-08: geen pauzescherm bij een verse start terwijl 'ie in de planner aan
  // stond).
  const prev = vorige || { toestand: 'pauze', sinds: nowMs, wachtSinds: null };

  if (speeltNu) {
    if (prev.toestand === 'spelen') {
      return { toestand: 'spelen', sinds: prev.sinds, wachtSinds: null, veranderd: false };
    }
    // Er speelt weer iets, maar het pauzescherm gaat pas ná de wachttijd weg.
    const wachtSinds = prev.wachtSinds != null ? prev.wachtSinds : nowMs;
    if (nowMs - wachtSinds >= spelenDebounceMs) {
      return { toestand: 'spelen', sinds: nowMs, wachtSinds: null, veranderd: true };
    }
    return { toestand: 'pauze', sinds: prev.sinds, wachtSinds, veranderd: false };
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
function bouwLiveMatches(tournaments, cameraTables, now = new Date()) {
  const vandaag = zaalDag(now);
  const uit = {};
  for (const tn of cameraTables || []) {
    let gevonden = null;
    for (const t of tournaments || []) {
      // Alleen wat vandaag telt (#86) — anders staat er een partij van weken geleden
      // als "huidige stand" op het dashboard.
      const m = relevanteMatch(t, tn, vandaag);
      if (!m) continue;
      if (String(m.status || '').toLowerCase() === 'playing') { gevonden = m; break; } // lopende wint altijd
      if (!gevonden) gevonden = m;
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

// Bouwt het ZAALBREDE raster: per fysieke tafel (over álle toernooien van vandaag) de
// meest relevante wedstrijd. Voedt het eigen Mokum-tafelraster (#54) dat de Cuescore-
// jumbotron vervangt in het pauzescherm. In tegenstelling tot bouwLiveMatches (vaste
// cameralijst) neemt dit élke tafel mee die vandaag een wedstrijd heeft. Een lopende
// (playing) wedstrijd wint van een afgeronde; tafels zonder toegewezen wedstrijd
// (m.table == null) vallen weg. Gesorteerd op tafelnummer. Pure functie → testbaar.
function bouwZaalRaster(tournaments, now = new Date()) {
  const vandaag = zaalDag(now);
  // Compacte spelerweergave: naam + foto-URL + vlag-URL (of null bij ontbreken).
  const speler = (p) => (p ? { name: p.name || null, image: p.image || null, flag: p.flag || null } : null);
  const perTafel = new Map();
  for (const t of tournaments || []) {
    for (const m of t.matches || []) {
      if (m.table == null) continue;
      // Zelfde regel als hierboven (#86): het zaalraster toont wat er vandaag gebeurt,
      // niet elke partij die de league deze zomer op deze tafel heeft gespeeld.
      if (!teltVoorVandaag(m, vandaag)) continue;
      const nr = Number(m.table);
      if (!Number.isFinite(nr)) continue;
      const speelt = String(m.status || '').toLowerCase() === 'playing';
      const bestaand = perTafel.get(nr);
      const oudSpeelt = bestaand && String(bestaand.m.status || '').toLowerCase() === 'playing';
      // Niets → zetten. Anders: lopend verdringt afgerond, en tussen twee afgeronde
      // partijen van vandaag wint de laatst gestarte (de league speelt er meerdere per dag).
      const beter = !bestaand
        || (speelt && !oudSpeelt)
        || (speelt === !!oudSpeelt && Date.parse(m.start) > Date.parse(bestaand.m.start));
      if (beter) perTafel.set(nr, { m, toernooi: t.name || '' });
    }
  }
  return [...perTafel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([nr, { m, toernooi }]) => ({
      table: nr,
      status: m.status || null,
      round: m.roundName || null,
      tournament: toernooi,
      // Spelers als object met naam + foto + vlag (voor het tafelraster #54).
      playerA: speler(m.playerA),
      playerB: speler(m.playerB),
      scoreA: m.scoreA != null ? m.scoreA : null,
      scoreB: m.scoreB != null ? m.scoreB : null,
    }));
}

// Telt alle lopende (playing) wedstrijden in de zaal (over alle toernooien) — voor
// de dashboard-teller "X wedstrijden nu live in de zaal".
function telZaalLive(tournaments) {
  let n = 0;
  for (const t of tournaments || []) {
    for (const m of (t.matches || [])) {
      if (String(m.status || '').toLowerCase() === 'playing') n++;
    }
  }
  return n;
}

// Bouwt de setOverlay-commando's (zonder id/tijd) om het pauzescherm aan of uit te
// zetten: de opgegeven pauze-overlaysleutels op `toonPauze`. Slaat sleutels over die
// niet in overlayBron staan.
function pauzeCommandos(tableNumber, toonPauze, overlayBron, keys) {
  return (keys || [])
    .filter((k) => overlayBron && overlayBron[k])
    .map((k) => ({ type: 'setOverlay', tableNumber: Number(tableNumber), sourceName: overlayBron[k], enabled: !!toonPauze }));
}

// Bouwt de refreshSource-commando's om de cache van de opgegeven bronnen te verversen
// (het Cuescore-scorebord opnieuw laten laden zodat oude toernooi-info verdwijnt).
function refreshCommandos(tableNumber, overlayBron, keys) {
  return (keys || [])
    .filter((k) => overlayBron && overlayBron[k])
    .map((k) => ({ type: 'refreshSource', tableNumber: Number(tableNumber), sourceName: overlayBron[k] }));
}

module.exports = { tafelSpeeltNu, volgendeToestand, pauzeCommandos, refreshCommandos, bouwLiveMatches, telZaalLive, bouwZaalRaster };
