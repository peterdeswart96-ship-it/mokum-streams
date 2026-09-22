// Pure logica voor het scorebord-vangnet (#153). Géén netwerk/opslag → unit-testbaar.
// De timer-Function (functions/scorebordWacht.js) doet de fetch + opslag + enqueue.
//
// Waarom dit bestaat: bij een competitiewedstrijd hangt het Cuescore-scorebord aan wat de
// spelers zélf aan de tafel koppelen en bijhouden. Doen ze dat (17-09), dan is het het mooiste
// beeld dat er is: spelersnamen én de partijstand. Doen ze het niet (21-09), dan stond er drie
// en een half uur lang 0-0 in beeld terwijl er allang twee anderen speelden. Het scorebord
// blijft dus aan, maar verdwijnt zodra het aantoonbaar achterloopt.

// Vingerafdruk van wat de kijker ziet: verandert deze niet, dan staat het beeld stil.
//
// We kijken bewust alleen naar spelers + stand + welke wedstrijd het is — niet naar de hele
// respons. Daar kan een tijdstempel of een advertentieveld in zitten dat élke ronde verandert;
// dan zouden we stilstand nooit opmerken.
//
// Retour: een string, of **null** als we de stand niet herkennen. null betekent "geen oordeel":
// de beller grijpt dan niet in. Dat is met opzet — de exacte veldnamen bij een lopende
// wedstrijd zijn nog niet op een echte speelavond geverifieerd (op een stille dag antwoordt
// Cuescore alleen `{"status":"WAITING"}`), en verkeerd ingrijpen is erger dan niets doen.
function vingerafdruk(data) {
  if (!data || typeof data !== 'object') return null;

  // WAITING = er staat niets op deze tafel. Dan toont de overlay zelf al "Next match will start
  // shortly" en valt er niets te verbergen.
  if (String(data.status || '').toUpperCase() === 'WAITING') return null;

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

  // Zonder spelers én zonder stand hebben we niets herkenbaars beet.
  const heeftSpelers = !!(a || b);
  const heeftStand = sa != null || sb != null;
  if (!heeftSpelers && !heeftStand) return null;

  const id = m.matchId != null ? m.matchId : (m.challengeId != null ? m.challengeId : '');
  return [id, a, b, sa == null ? '' : sa, sb == null ? '' : sb].join('|');
}

// Toestand per tafel: staat het beeld stil, en moeten we daarop schakelen?
//
//   vorige : { afdruk: string, sinds: ms, verborgen: bool } | null
//   afdruk : uit vingerafdruk() — null = geen oordeel, laat alles met rust
//   drempelMs : hoe lang dezelfde afdruk mag blijven staan vóór we het scorebord verbergen
//
// Retour: { afdruk, sinds, verborgen, actie } waarbij actie 'verbergen' | 'tonen' | null is.
// Alleen bij een actie hoeft de beller een commando te sturen.
function volgendeScorebordToestand(vorige, afdruk, nowMs, drempelMs) {
  // Geen oordeel: toestand onveranderd laten. Ook niet 'tonen' — dat zou het scorebord
  // terugzetten op het moment dat Cuescore even onbereikbaar is.
  if (afdruk == null) {
    return vorige
      ? { ...vorige, actie: null }
      : { afdruk: null, sinds: nowMs, verborgen: false, actie: null };
  }

  // Eerste keer dat we deze tafel zien.
  if (!vorige || vorige.afdruk == null) {
    return { afdruk, sinds: nowMs, verborgen: false, actie: null };
  }

  // Het beeld beweegt weer → scorebord mag (terug) in beeld.
  if (afdruk !== vorige.afdruk) {
    return {
      afdruk,
      sinds: nowMs,
      verborgen: false,
      actie: vorige.verborgen ? 'tonen' : null,
    };
  }

  // Zelfde beeld als vorige keer: hoe lang al?
  const stilMs = nowMs - Number(vorige.sinds || nowMs);
  if (!vorige.verborgen && stilMs >= drempelMs) {
    return { afdruk, sinds: vorige.sinds, verborgen: true, actie: 'verbergen' };
  }
  return { afdruk, sinds: vorige.sinds, verborgen: !!vorige.verborgen, actie: null };
}

module.exports = { vingerafdruk, volgendeScorebordToestand };
