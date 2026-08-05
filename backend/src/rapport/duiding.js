// Duiding van logregels voor het ochtendrapport (#91).
//
// De logs zijn geschreven voor ontwikkelaars; dit rapport is voor Nick en Mark. Deze module
// vertaalt de regels die ertoe doen naar gewone taal, telt wat er gebeurd is, en trekt er
// conclusies uit. Puur — geen netwerk, geen opslag → volledig testbaar.
//
// Uitgangspunt: liever te weinig regels tonen dan te veel. Een rapport waar dertig regels
// ruis in staan wordt niet gelezen, en dan valt de ene regel die ertoe deed ook weg.

const PROBLEEM_RE = /WAARSCHUWING|Exception|niet bereikbaar|FOUT|mislukt|nog niet gelukt|niet gevonden|threshold exceeded/i;

// Opstartruis van Azure, géén storing (#91, gemeld 05-08).
//
// De Function App schaalt naar nul als er niets te doen is. Start hij weer op, dan vraagt
// Azure "ben je er al?" terwijl Node nog laadt, en dat levert deze regel op. Op 04-08 stond
// 'ie om 23:53 in de logs; om 23:55 stopte checkStops de tafel gewoon en om 23:56 was de
// video afgerond. Er is dus niets door geraakt.
//
// Hij stond eerst als rood PROBLEEM in de mail. Dat schrikt Nick en Mark op zonder reden, en
// erger: als élke ochtend zo'n rode balk staat, kijkt niemand meer op van een échte.
const OPSTARTRUIS_RE = /Process reporting unhealthy|NoScriptHost/i;

// Tafelnummer uit een regel, of null. Let op de vormen die in de logs voorkomen:
//   [checkStops] tafel 3: stoppen — ...
//   [OK] Broadcast + startcommando's: tafel 1 — "..."
//   [finalizeVideos] tafel 16 gefinaliseerd (...)
const tafelIn = (m) => {
  const t = /tafel (\d+)/i.exec(m || '');
  return t ? Number(t[1]) : null;
};
const metTafel = (m, tekst) => {
  const n = tafelIn(m);
  return n ? `Tafel ${n}: ${tekst}` : tekst.charAt(0).toUpperCase() + tekst.slice(1);
};

// Waarom stopte een tafel? De reden staat achter "stoppen — " en is geschreven voor
// ontwikkelaars; hier vertalen we 'm naar wat het voor de zaal betekent. Zonder dit stond er
// alleen "het systeem zag dat er niets meer te tonen was", en dan mis je precies het stuk dat
// het interessant maakt (gemeld 05-08).
function stopUitleg(m) {
  const finale = /finale bezig op tafel (\d+)/i.exec(m);
  if (finale) return `De finale was bezig op tafel ${finale[1]}, dus op deze tafel viel niets meer te zien. Hij sloot vanzelf zodat de aandacht naar de finale ging.`;
  if (/podium-grace/i.test(m)) return 'Het toernooi was klaar. Het medaillescherm met de winnaar bleef nog drie minuten in beeld en daarna sloot de uitzending.';
  if (/competitie/i.test(m)) return 'De laatste wedstrijd van de avond op deze tafel was gespeeld.';
  if (/eindtijd/i.test(m)) return 'De eindtijd die in de planner staat was bereikt.';
  if (/toernooi klaar/i.test(m)) return 'Het toernooi was afgelopen.';
  const reden = /stoppen\s*[—-]\s*(.+)$/i.exec(m);
  return reden ? `Reden: ${reden[1].replace(/\s*\(#\d+\)\s*$/, '')}.` : 'Het systeem zag dat er niets meer te tonen was en heeft zelf afgesloten.';
}

// Eerste treffer wint, dus specifiek boven algemeen.
// `titel` en `uitleg` mogen ook een functie van de logregel zijn, zodat het tafelnummer en
// de reden bewaard blijven in plaats van weggepoetst te worden.
const REGELS = [
  {
    // DIT is de regel die een echte start markeert. `[createBroadcasts] tafel-herresolutie`
    // ziet er verwarrend genoeg uit alsof er iets start, maar dat schrijft de timer elke vijf
    // minuten zolang een toernooi loopt — die stond eerst negen keer in de mail (05-08).
    test: /^\[OK\] Broadcast \+ startcommando/,
    soort: 'goed',
    titel: (m) => metTafel(m, 'automatisch gestart volgens de planning'),
    uitleg: 'Het systeem begon uit zichzelf, kort voor de eerste wedstrijd. Zo hoort het te gaan.',
  },
  {
    test: /^\[createBroadcasts\]/,
    soort: null, // routinewerk: niet in het rapport
  },
  {
    test: OPSTARTRUIS_RE,
    soort: 'neutraal',
    titel: 'Server opnieuw opgestart',
    uitleg: 'Normaal: de server slaapt als er niets te doen is en start weer op zodra er werk komt. Er gaat niets verloren.',
  },
  {
    test: /^\[streams\/start\].*ad-hoc \(geen toernooi\)/,
    soort: 'let-op',
    titel: (m) => metTafel(m, 'losse uitzending gestart, zonder toernooi eraan'),
    uitleg: 'Deze stopt nooit vanzelf: het systeem weet niet wanneer een losse partij klaar is. Iemand moet hem met de hand stoppen.',
  },
  {
    test: /^\[streams\/start\]/,
    soort: 'let-op',
    titel: (m) => metTafel(m, 'met de hand gestart'),
    uitleg: 'Iemand heeft dit zelf aangezet in het dashboard. Bij een ingepland toernooi was dat niet nodig geweest.',
  },
  {
    test: /^\[streams\/stop\]/,
    soort: 'neutraal',
    titel: (m) => metTafel(m, 'met de hand gestopt'),
    uitleg: 'Iemand heeft de uitzending zelf afgesloten in het dashboard.',
  },
  {
    test: /^\[checkStops\].*ad-hoc stream gekoppeld/,
    soort: 'let-op',
    titel: (m) => metTafel(m, 'losse uitzending alsnog aan het toernooi gekoppeld'),
    uitleg: 'Er stond een losse uitzending op een tafel waar duidelijk een toernooi speelde. Het systeem heeft die alsnog overgenomen, zodat hij toch netjes wordt afgesloten en een thumbnail krijgt. Het betekent wel dat de video begint vóórdat het toernooi begon.',
  },
  {
    test: /^\[checkStops\].*stoppen/,
    soort: 'goed',
    titel: (m) => metTafel(m, 'automatisch gestopt'),
    uitleg: stopUitleg,
  },
  {
    test: /gefinaliseerd/,
    soort: 'goed',
    titel: (m) => metTafel(m, 'video afgerond'),
    uitleg: (m) => {
      const hs = /(\d+) hoofdstukken/.exec(m);
      return `De video heeft automatisch een thumbnail gekregen${hs ? ` en ${hs[1]} hoofdstukken — een per gespeelde partij` : ' en hoofdstukken per partij'}, en staat klaar op het kanaal.`;
    },
  },
  {
    test: /^\[challenge\/aanmaken\]/,
    soort: 'neutraal',
    titel: 'Challenge aangemaakt via de ledenpagina',
    uitleg: 'Een lid heeft zelf een challenge in Cuescore aangemaakt.',
  },
];

// Wat betekent deze regel? Retour: { soort, titel, uitleg } of null als 'ie niet in het
// rapport thuishoort (routinewerk zoals de planning-import en het pauzescherm).
function duidRegel(bericht) {
  const m = String(bericht || '').trim();
  if (!m) return null;
  // Opstartruis eerst: die bevat het woord "Unhealthy" en zou anders als storing tellen.
  if (OPSTARTRUIS_RE.test(m)) {
    return {
      soort: 'neutraal',
      titel: 'Server opnieuw opgestart',
      uitleg: 'Normaal: de server slaapt als er niets te doen is en start weer op zodra er werk komt. Er gaat niets verloren.',
    };
  }
  if (PROBLEEM_RE.test(m)) {
    return {
      soort: 'fout',
      titel: 'Technische waarschuwing',
      uitleg: 'De server meldde een storing. Kijk of er in dezelfde minuut een uitzending is geraakt; is dat niet zo, dan is er niets aan de hand.',
    };
  }
  for (const r of REGELS) {
    if (!r.test.test(m)) continue;
    if (!r.soort) return null;
    const waarde = (v) => (typeof v === 'function' ? v(m) : v);
    return { soort: r.soort, titel: waarde(r.titel), uitleg: waarde(r.uitleg) };
  }
  return null;
}

const tafelUit = (m) => {
  const t = /tafel (\d+)/i.exec(m || '');
  return t ? Number(t[1]) : null;
};

const minuten = (a, b) => Math.round((b - a) / 60000);

// Kleur per uitzending, zodat je in het rapport in één oogopslag ziet welke regels bij
// elkaar horen. Vier vaste kleuren uit het gevalideerde categorische palet (blauw, oranje,
// aqua, violet): die halen alle controles op kleurenblindheid, ook als je ze twee aan twee
// vergelijkt. De naam van de uitzending staat er altijd in tekst bij — kleur mag nooit het
// enige onderscheid zijn, en aqua haalt de contrastdrempel op een lichte achtergrond niet.
const STREAM_KLEUREN = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7'];

// Titel uit een logregel: die staat tussen dubbele aanhalingstekens.
const titelUit = (m) => {
  const t = /"([^"]{2,120})"/.exec(m || '');
  return t ? t[1] : null;
};
const videoUit = (m) => {
  const v = /video ([A-Za-z0-9_-]{6,})|\(([A-Za-z0-9_-]{8,})\)/.exec(m || '');
  return v ? (v[1] || v[2]) : null;
};

function uurNotatie(min) {
  const u = Math.floor(min / 60);
  const r = min % 60;
  return u ? `${u} uur en ${r} minuten` : `${r} minuten`;
}

// Analyseert een hele avond. `regels` = [{ tijd: Date, bericht: string }] op volgorde.
//
// Retour:
//   gebeurtenissen : de regels die in het rapport horen, met duiding
//   cijfers        : tellingen voor de kop van de mail
//   bevindingen    : conclusies in gewone taal ({ soort, kop, tekst })
function analyseer(regels, { langsteOpenUren = 2 } = {}) {
  const rijen = (regels || []).filter((r) => r && r.tijd && r.bericht);

  const gebeurtenissen = [];
  const problemen = new Map(); // unieke melding → aantal
  const open = new Map();      // tafelnummer → starttijd van een lopende uitzending
  const streams = [];          // elke uitzending van de avond, met naam en kleur
  const lopend = new Map();    // tafelnummer → de uitzending die daar nu draait
  const uitzendingen = [];     // { tafel, start, stop, adhoc }

  let pauzeschakelingen = 0;
  let hoofdstukken = 0;
  let automatischGestart = 0;
  let automatischGestopt = 0;
  let handmatigGestart = 0;
  let gekoppeld = 0;

  for (const r of rijen) {
    const m = String(r.bericht).replace(/\r?\n/g, ' ').trim();

    // Eerst tellen, dan pas beslissen of we 'm tonen: een fout die zich honderd keer
    // herhaalt is één probleem, maar mag nooit uit de samenvatting vallen. Opstartruis
    // telt niet mee — zie OPSTARTRUIS_RE.
    if (PROBLEEM_RE.test(m) && !OPSTARTRUIS_RE.test(m)) problemen.set(m, (problemen.get(m) || 0) + 1);

    if (/^\[pauzeScherm\]/.test(m)) { pauzeschakelingen++; continue; }

    const hs = /(\d+) hoofdstukken/.exec(m);
    if (hs) hoofdstukken += Number(hs[1]);

    const autoStart = /^\[OK\] Broadcast \+ startcommando/.test(m);
    if (autoStart) automatischGestart++;
    if (/^\[checkStops\].*stoppen/.test(m)) automatischGestopt++;
    if (/^\[checkStops\].*ad-hoc stream gekoppeld/.test(m)) gekoppeld++;

    // Uitzendingen bijhouden om te zien hoe lang ze openstonden. Let op dat de
    // automatische start uit een ÁNDERE regel komt dan de handmatige.
    const tafel = tafelUit(m);
    if (/^\[streams\/start\]/.test(m) || autoStart) {
      if (/^\[streams\/start\]/.test(m)) handmatigGestart++;
      if (tafel) open.set(tafel, { start: r.tijd, adhoc: /ad-hoc \(geen toernooi\)/.test(m) });
    }
    // Afsluiten kan op drie manieren in de logs staan, en ze zien er alle drie anders uit:
    //   [streams/stop] tafel 1 ...                      (met de hand)
    //   [checkStops] tafel 3: stoppen — ...             (het besluit)
    //   [OK] 1 stopStream-commando(s): tafels 3         (let op: "tafels", meervoud, en
    //                                                    er kunnen er meerdere in staan)
    const sluit = new Set();
    if (/^\[streams\/stop\]/.test(m) && tafel) sluit.add(tafel);
    const besluit = /^\[checkStops\] tafel (\d+): stoppen/.exec(m);
    if (besluit) sluit.add(Number(besluit[1]));
    const commando = /stopStream-commando\(s\): tafels? ([\d,\s]+)/.exec(m);
    if (commando) for (const n of commando[1].split(',')) if (Number(n)) sluit.add(Number(n));

    for (const t of sluit) {
      if (!open.has(t)) continue;
      const o = open.get(t);
      uitzendingen.push({ tafel: t, start: o.start, stop: r.tijd, adhoc: o.adhoc });
      open.delete(t);
    }

    // Welke uitzending hoort bij deze regel? We houden per tafel bij wat er draait, zodat
    // ook een regel die de naam niet noemt (een stop, een afronding) 'm toch meekrijgt.
    if (tafel && (autoStart || /^\[streams\/start\]/.test(m))) {
      const naam = titelUit(m);
      streams.push({
        tafel,
        naam: naam || (autoStart ? `Tafel ${tafel}` : `Losse uitzending op tafel ${tafel}`),
        videoId: videoUit(m),
        kleur: STREAM_KLEUREN[streams.length % STREAM_KLEUREN.length],
      });
      lopend.set(tafel, streams[streams.length - 1]);
    }
    const stream = tafel ? lopend.get(tafel) : null;
    if (stream && !stream.videoId) stream.videoId = videoUit(m);

    const duiding = duidRegel(m);
    if (duiding) {
      // Twee keer hetzelfde achter elkaar? Optellen in plaats van herhalen. Een timer die
      // elke minuut hetzelfde meldt hoort niet als twintig regels in een mail te staan.
      const vorige = gebeurtenissen[gebeurtenissen.length - 1];
      if (vorige && vorige.titel === duiding.titel) {
        vorige.aantal = (vorige.aantal || 1) + 1;
        vorige.laatsteTijd = r.tijd;
      } else {
        gebeurtenissen.push({
          tijd: r.tijd,
          bericht: m,
          aantal: 1,
          ...duiding,
          ...(stream ? { stream: stream.naam, kleur: stream.kleur, tafel: stream.tafel } : {}),
        });
      }
    }

    // Pas hier de tafel losmaken van zijn uitzending. Deed ik dat eerder — bij het bepalen
    // van `sluit` — dan raakte juist de stopregel zelf zijn naam en kleur kwijt, terwijl dat
    // de regel is waar je ze het hardst nodig hebt.
    for (const t of sluit) lopend.delete(t);
  }

  // Nooit gestopt = tot het eind van het venster open blijven staan.
  const eind = rijen.length ? rijen[rijen.length - 1].tijd : null;
  for (const [tafel, o] of open) uitzendingen.push({ tafel, start: o.start, stop: eind, adhoc: o.adhoc, nooitGestopt: true });

  // ── Conclusies ─────────────────────────────────────────────────────────────
  const bevindingen = [];

  if (handmatigGestart > 0 && automatischGestart === 0) {
    bevindingen.push({
      soort: 'fout',
      kop: 'Alle uitzendingen zijn met de hand gestart',
      tekst: 'Het systeem heeft vannacht geen enkele uitzending uit zichzelf gestart. Dat gebeurt als het toernooi niet is ingepland in het dashboard. Gevolg: iemand moet het opmerken en zelf aanzetten, en dan mist het begin van de avond.',
    });
  }

  if (gekoppeld > 0) {
    bevindingen.push({
      soort: 'fout',
      kop: 'Een losse uitzending is alsnog aan het toernooi gekoppeld',
      tekst: 'Er stond al een uitzending te draaien op een tafel die daarna voor het toernooi werd gebruikt. Het systeem heeft die overgenomen, dus de video is netjes afgesloten — maar hij begint met de tijd waarin er nog niets te zien was.',
    });
  }

  // Alleen LOSSE uitzendingen die lang openstaan zijn een probleem, plus alles wat helemaal
  // nooit gestopt is. Een toernooi-uitzending van zes uur is doodnormaal — die zou hier
  // anders elke avond ten onrechte als fout in de mail staan, en dan leest niemand 'm meer.
  for (const u of uitzendingen) {
    const min = u.stop ? minuten(u.start, u.stop) : 0;
    if (u.nooitGestopt) {
      bevindingen.push({
        soort: 'fout',
        kop: `Uitzending op tafel ${u.tafel} is nooit gestopt`,
        tekst: `Hij stond aan het eind van het rapport nog steeds open, inmiddels ${uurNotatie(min)}. Controleer of hij nog draait.`,
      });
    } else if (u.adhoc && min >= langsteOpenUren * 60) {
      bevindingen.push({
        soort: 'fout',
        kop: `Losse uitzending op tafel ${u.tafel} stond ${uurNotatie(min)} open`,
        tekst: 'Een uitzending zonder toernooi stopt nooit vanzelf; iemand moet hem afsluiten zodra de partij klaar is. Zo lang open betekent een video waarin kijkers vooral naar een lege tafel kijken.',
      });
    }
  }

  if (problemen.size) {
    bevindingen.push({
      soort: 'let-op',
      kop: `${problemen.size} technische waarschuwing${problemen.size === 1 ? '' : 'en'}`,
      tekst: 'De server meldde een storing. Draaide er op dat moment geen uitzending, dan heeft niemand er iets van gemerkt.',
    });
  }

  if (!bevindingen.length) {
    bevindingen.push({
      soort: 'goed',
      kop: 'Niets bijzonders',
      tekst: 'Alles ging vanzelf: gestart, geschakeld, gestopt en afgerond zonder dat er iemand aan te pas kwam.',
    });
  }

  return {
    gebeurtenissen,
    bevindingen,
    cijfers: {
      logregels: rijen.length,
      automatischGestart,
      handmatigGestart,
      automatischGestopt,
      afgerondeVideos: gebeurtenissen.filter((g) => /gefinaliseerd/.test(g.bericht)).length,
      hoofdstukken,
      pauzeschakelingen,
      problemen: problemen.size,
      uitzendingen,
      streams,
    },
  };
}

module.exports = { duidRegel, analyseer, PROBLEEM_RE, REGELS, uurNotatie };
