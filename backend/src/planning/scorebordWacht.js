// Pure logica voor het verversen van het scorebord (#153). Géén netwerk/opslag → unit-testbaar.
// De timer-Function (functions/scorebordWacht.js) doet de fetch + opslag + enqueue.
//
// Waarom dit bestaat: op 21-09 stond bij alle uitgezonden wedstrijden urenlang dezelfde stand in
// beeld. Eerst leek dat te komen doordat niemand de stand bijhield — maar een van de teams liet
// zien dat ze het wél deden, en Cuescore bevestigt dat: de partijen stonden op de juiste tafels,
// werden bijgewerkt en netjes afgesloten. De data klopte dus; het beeld niet.
//
// Het probleem zit in de OBS-browserbron. De overlay-pagina van Cuescore stopt permanent met
// verversen zodra één aanvraag mislukt:
//
//     .fail(function(a){ Scoreboard.Overlay.pollerInterval = null })
//
// Geen retry, geen herstel — één hapering en de pagina blijft staan waar hij stond, de hele
// avond. Dat verklaart ook waarom meerdere tafels tegelijk bevroren (één netwerkhapering raakt
// alle bronnen) en waarom het de ene avond wel en de andere niet gebeurt.
//
// De oplossing is niet slimmer detecteren maar gewoon periodiek herladen: een refresh herstelt
// elke vorm van bevriezing, ongeacht de oorzaak.

// Vingerafdruk van wat er op deze tafel te zien hoort te zijn. Verandert die, dan moet het beeld
// meebewegen — en dat is precies het moment waarop een refresh nut heeft.
//
// Anders dan bij een stilstand-detectie is WAITING hier een volwaardige toestand: de overgang van
// "niets op de tafel" naar "er speelt iets" is juist een moment waarop het beeld moet veranderen.
//
// Retour: een string, of null als we het antwoord niet kunnen lezen (dan niets doen).
function vingerafdruk(data) {
  if (!data || typeof data !== 'object') return null;

  const status = String(data.status || '').toUpperCase();
  if (status === 'WAITING') return 'WAITING';

  // De stand kan op het hoogste niveau staan of onder een `match`-object; beide meenemen zodat
  // een kleine vormverandering bij Cuescore dit niet stilletjes uitschakelt.
  const m = (data.match && typeof data.match === 'object') ? data.match : data;

  const naam = (p) => {
    if (!p) return '';
    if (typeof p === 'string') return p;
    return String(p.name || p.fullname || p.firstname || '');
  };

  const a = naam(m.playerA);
  const b = naam(m.playerB);
  const sa = m.scoreA;
  const sb = m.scoreB;

  const heeftSpelers = !!(a || b);
  const heeftStand = sa != null || sb != null;
  if (!heeftSpelers && !heeftStand) return status || null;

  const id = m.matchId != null ? m.matchId : (m.challengeId != null ? m.challengeId : '');
  return [id, a, b, sa == null ? '' : sa, sb == null ? '' : sb].join('|');
}

// Moet deze tafel nu een refresh krijgen?
//
//   vorige        : { afdruk: string, laatsteRefresh: ms } | null
//   afdruk        : uit vingerafdruk() — null = onleesbaar, dan niets doen
//   minIntervalMs : hoe vaak we hooguit verversen (anti-geflikker)
//
// Regel: verversen zodra de afdruk verandert, maar nooit vaker dan minIntervalMs. Verandert er
// niets, dan ook niet verversen: een bevroren bron doet op dat moment geen kwaad, want er is toch
// niets nieuws te tonen. Zodra er wél iets verandert, haalt de refresh het beeld weer gelijk.
//
// Retour: { afdruk, laatsteRefresh, verversen }.
function volgendeRefreshToestand(vorige, afdruk, nowMs, minIntervalMs) {
  if (afdruk == null) {
    return vorige
      ? { ...vorige, verversen: false }
      : { afdruk: null, laatsteRefresh: 0, verversen: false };
  }

  // Eerste keer dat we deze tafel zien: onthouden, niet meteen verversen. De bron is net bij de
  // streamstart al ververst (startCommandsFor), dus die is op dat moment vers.
  if (!vorige || vorige.afdruk == null) {
    return { afdruk, laatsteRefresh: nowMs, verversen: false };
  }

  if (afdruk === vorige.afdruk) {
    return { afdruk, laatsteRefresh: vorige.laatsteRefresh, verversen: false };
  }

  // De afdruk is veranderd. Alleen verversen als de vorige refresh lang genoeg geleden is.
  const sindsRefresh = nowMs - Number(vorige.laatsteRefresh || 0);
  if (sindsRefresh < minIntervalMs) {
    return { afdruk, laatsteRefresh: vorige.laatsteRefresh, verversen: false };
  }
  return { afdruk, laatsteRefresh: nowMs, verversen: true };
}

module.exports = { vingerafdruk, volgendeRefreshToestand };
