// Pure logica voor het wedstrijd-archief (#59/#67): elke wedstrijd die we gefilmd hebben,
// met een deep-link naar het exacte moment in de video. Voedt zowel de zoekmachine op de
// Mokum Live-pagina als het run-out-overzicht (dat is simpelweg een filter hierop).
// Géén netwerk/opslag → volledig unit-testbaar.
//
// Waarom deep-links en geen clips: YouTube kent geen clip- of timestamp-playlists
// (startAt/endAt zijn afgeschaft). Knippen + her-uploaden kost 1.600 quota-eenheden per
// clip. Besluit 22-07 (#67): fase 1 = links naar het moment in de bestaande video.
//
// Koppeling video ↔ wedstrijd gaat via de hoofdstukken die bij het finaliseren zijn
// weggeschreven (`video-index/<videoId>.json`); die bevatten al de offset in seconden t.o.v.
// het begin van de stream. Zo werkt dit ook voor video's die al gefinaliseerd waren vóór dit
// issue — de index hoeft niet herschreven te worden.
//
// Volgorde van koppelen (#140): 1) het wedstrijd-id (`matchId`, bewaard sinds #140),
// 2) het spelerspaar op naam, 3) voor records die door een naamswijziging op 2 missen: de
// volgorde tussen twee wedstrijden die wél kloppen. Alleen namen was de oude situatie; een
// speler die zich bij Cuescore hernoemde viel dan bij een volledige rebuild uit het archief.

const { templateVoorToernooi, TEMPLATE_TEKST } = require('./detectie');

// Soort toernooi (de serie), los van seizoen en editienummer: "Fluke ranking 9ball
// Seizoen 3 #24" en "Fluke ranking 9ball #11" horen allebei bij "Fluke Ranking". Zo houdt
// het filter op de archiefpagina een handvol keuzes over in plaats van ruim honderd losse
// toernooien. Hergebruikt dezelfde classificatie als de thumbnails → één plek om te wijzigen.
function soortVanToernooi(naam) {
  const key = templateVoorToernooi(naam);
  const tekst = key && TEMPLATE_TEKST[key];
  return (tekst && tekst.titel) || 'Overig';
}

// Spelers als vergelijkbare sleutel (volgorde-onafhankelijk, hoofdletter-ongevoelig).
function spelersSleutel(namen) {
  return (namen || [])
    .map((n) => String(n || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

const YT_URL = (videoId, offsetSec) => `https://youtu.be/${videoId}?t=${Math.max(0, offsetSec | 0)}`;

// Kortste rack dat we als een écht gespeelde run-out accepteren.
// Waarom: als de teller de stand achteraf in één keer intikt, logt Cuescore alle racks
// binnen enkele seconden — we zagen racks van 0,2 s. Breken en negen ballen wegwerken
// kan fysiek niet onder de halve minuut. Gemeten over 590 run-out-racks in het archief
// ligt de mediaan op 205 s en zit alles ónder 30 s in dat ingetikte cluster; de
// snelste échte (losstaande) run-outs zitten op 35–59 s en blijven dus staan.
const MIN_RACK_SEC = 30;

const echtRack = (rack) => rack && (rack.duurSec == null || rack.duurSec >= MIN_RACK_SEC);

// Clipvenster voor het afspelen van een run-out (#71): het rack tot even na de laatste bal,
// maar hoogstens de laatste 3 minuten (besluit Peter). Is het rack korter, dan speelt 'ie
// helemaal — inclusief de afstoot. Is het langer, dan tellen we 3 min terug vanaf de laatste
// bal; de afstoot van zo'n lang rack valt dan buiten beeld en die clip keur je af.
// Zo blijft geen enkele clip langer dan ~3 min (eerder tot 11 min bij een lang rack).
const CLIP_MAX_SEC = 180; // hoogstens de laatste 3 min
const CLIP_NA_SEC = 4;    // naloop, zodat de clip niet op de bal zelf afkapt

function clipVenster(startSec, eindSec) {
  if (eindSec == null) return { clipVan: null, clipTot: null };
  return { clipVan: Math.max(0, Math.max(startSec, eindSec - CLIP_MAX_SEC)), clipTot: eindSec + CLIP_NA_SEC };
}

// Koppelt de wedstrijden van één tafel aan de hoofdstukken van een video (#140). Retour: een
// Map van wedstrijd-object → offset in seconden. Wedstrijden die nergens aan te koppelen zijn
// staan er niet in (die zitten niet in deze video, of het is te onzeker).
//
// De terugval op volgorde werkt zo: hoofdstukken zijn de wedstrijden van deze tafel op
// starttijd (zie hoofdstukData), dus ze staan in dezelfde volgorde. Wedstrijden die op id of
// naam kloppen zijn ankers. Tussen twee ankers moeten de onbekende hoofdstukken en de
// onbekende wedstrijden even lang zijn; dan horen ze op volgorde bij elkaar. Zijn ze dat niet
// (bijv. omdat een wedstrijd buiten de video viel), dan koppelen we niets: liever een
// wedstrijd missen dan een verkeerd moment in een video tonen.
function koppelHoofdstukken(rec, tafel, tournament) {
  const hs = rec.hoofdstukken || [];
  const perId = new Map();
  const perSleutel = new Map();
  hs.forEach((h, i) => {
    if (h && h.matchId != null && !perId.has(String(h.matchId))) perId.set(String(h.matchId), i);
    const sleutel = spelersSleutel(h && h.spelers);
    // Eerste voorkomen wint (een paar speelt zelden twee keer op dezelfde tafel).
    if (sleutel && !perSleutel.has(sleutel)) perSleutel.set(sleutel, i);
  });

  const opTafel = ((tournament && tournament.matches) || []).filter((m) => m && String(m.table) === tafel);
  const naam = (p) => (p && p.name) || null;

  // Stap 1 en 2: id, dan naam.
  const hoofdstukVan = new Map(); // wedstrijd → index in hs
  const gebruikt = new Set();
  for (const m of opTafel) {
    let i = m.matchId != null ? perId.get(String(m.matchId)) : undefined;
    if (i === undefined) i = perSleutel.get(spelersSleutel([naam(m.playerA), naam(m.playerB)]));
    if (i !== undefined && !gebruikt.has(i)) {
      hoofdstukVan.set(m, i);
      gebruikt.add(i);
    }
  }

  // Stap 3: op volgorde tussen ankers.
  const gesorteerd = opTafel
    .filter((m) => m.start && !Number.isNaN(Date.parse(m.start)) && (naam(m.playerA) || naam(m.playerB)))
    .sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  let vorigJ = -1;
  let vorigC = -1;
  const koppelSegment = (totJ, totC) => {
    const vrijeM = gesorteerd.slice(vorigJ + 1, totJ).filter((m) => !hoofdstukVan.has(m));
    const vrijeC = [];
    for (let c = vorigC + 1; c < totC; c++) if (!gebruikt.has(c) && hs[c] && (hs[c].spelers || []).length) vrijeC.push(c);
    if (vrijeM.length > 0 && vrijeM.length === vrijeC.length) {
      vrijeM.forEach((m, k) => { hoofdstukVan.set(m, vrijeC[k]); gebruikt.add(vrijeC[k]); });
    }
  };
  const ankers = [];
  gesorteerd.forEach((m, j) => { if (hoofdstukVan.has(m)) ankers.push({ j, c: hoofdstukVan.get(m) }); });
  for (const { j, c } of ankers) {
    if (c <= vorigC) continue; // anker in de verkeerde volgorde: niet op vertrouwen
    koppelSegment(j, c);
    vorigJ = j;
    vorigC = c;
  }
  koppelSegment(gesorteerd.length, hs.length);

  const offsets = new Map();
  for (const [m, i] of hoofdstukVan) offsets.set(m, hs[i].offsetSec);
  return offsets;
}

// Bouwt de archiefregels van één video. `indexRecord` = video-index/<id>.json,
// `tournament` = genormaliseerd Cuescore-toernooi. Retour: array (kan leeg zijn).
function wedstrijdenVoorVideo(indexRecord, tournament) {
  const rec = indexRecord || {};
  if (!rec.videoId) return [];
  const tafel = String(rec.tableNumber);

  // Offset per wedstrijd uit de al bewaarde hoofdstukken (id → naam → volgorde, zie #140).
  const offsetPerWedstrijd = koppelHoofdstukken(rec, tafel, tournament);

  const naamToernooi = rec.tournamentName || (tournament && tournament.name) || '';

  const uit = [];
  for (const m of (tournament && tournament.matches) || []) {
    if (!m || String(m.table) !== tafel) continue;
    const a = (m.playerA && m.playerA.name) || null;
    const b = (m.playerB && m.playerB.name) || null;
    const offset = offsetPerWedstrijd.get(m);
    if (offset == null) continue; // wedstrijd zit niet in deze video

    // Run-outs (#67): één regel per gewonnen rack, met een EIGEN offset. Cuescore's
    // rack-log geeft het moment waarop dat rack begon, dus we linken naar de run-out
    // zelf in plaats van naar het begin van de partij (die 20–40 min kan duren).
    // Het rack-moment = wedstrijd-offset + (rackstart − wedstrijdstart).
    const runouts = [];
    const wedstrijdStart = Date.parse(m.start || '');
    const heeftLog = (m.runoutRacks || []).length > 0;
    for (const rack of (m.runoutRacks || []).filter(echtRack)) {
      const speler = rack.kant === 'A' ? a : b;
      const rackStart = Date.parse(rack.start || '');
      if (!speler || Number.isNaN(rackStart) || Number.isNaN(wedstrijdStart)) continue;
      const rackOffset = Math.max(0, offset + Math.round((rackStart - wedstrijdStart) / 1000));
      const rackEind = Date.parse(rack.eind || '');
      const eindSec = Number.isNaN(rackEind)
        ? null
        : Math.max(rackOffset, offset + Math.round((rackEind - wedstrijdStart) / 1000));
      runouts.push({
        speler,
        offsetSec: rackOffset,
        eindSec,
        ...clipVenster(rackOffset, eindSec),
        url: YT_URL(rec.videoId, rackOffset),
        exact: true,
      });
    }
    // Geen rack-log (oudere wedstrijden): val terug op het begin van de partij. Is er WÉL
    // een log maar bleef er niets van over, dan waren het geen echte run-outs — dan ook
    // geen terugval, want dan zetten we de valse meldingen alsnog terug.
    if (!heeftLog) {
      for (const [speler, aantal] of [[a, m.runoutsA], [b, m.runoutsB]]) {
        for (let i = 0; speler && i < (Number(aantal) || 0); i++) {
          runouts.push({
            speler, offsetSec: offset, eindSec: null, clipVan: null, clipTot: null,
            url: YT_URL(rec.videoId, offset), exact: false,
          });
        }
      }
    }

    uit.push({
      videoId: rec.videoId,
      url: YT_URL(rec.videoId, offset),
      offsetSec: offset,
      datum: rec.datum || null,
      tafel: Number(rec.tableNumber),
      toernooi: naamToernooi,
      soort: soortVanToernooi(naamToernooi),
      tournamentId: rec.tournamentId != null ? rec.tournamentId : (tournament && tournament.id) || null,
      ronde: m.roundName || null,
      spelers: [a, b].filter(Boolean),
      score: [m.scoreA == null ? null : Number(m.scoreA), m.scoreB == null ? null : Number(m.scoreB)],
      runouts,
    });
  }
  return uit;
}

// Vervangt de regels van één video in de bestaande lijst (idempotent bij opnieuw
// finaliseren) en sorteert: nieuwste datum eerst, binnen een video op offset.
function mergeWedstrijden(bestaand, videoId, nieuw) {
  const rest = (bestaand || []).filter((r) => r && r.videoId !== videoId);
  return sorteerWedstrijden([...rest, ...(nieuw || [])]);
}

function sorteerWedstrijden(lijst) {
  return [...(lijst || [])].sort((x, y) => {
    const d = String(y.datum || '').localeCompare(String(x.datum || '')); // nieuwste eerst
    if (d !== 0) return d;
    if (x.videoId !== y.videoId) return String(x.videoId).localeCompare(String(y.videoId));
    return (x.offsetSec || 0) - (y.offsetSec || 0);
  });
}

// Run-out-overzicht (#67): één regel per gewonnen rack, met de link naar dat rack
// (of naar het begin van de partij als de rack-log ontbreekt). Nieuwste eerst.
function runoutsUitArchief(lijst) {
  const uit = [];
  for (const r of lijst || []) {
    for (const ro of (r && r.runouts) || []) {
      const tegen = (r.spelers || []).find((s) => s !== ro.speler) || null;
      uit.push({
        videoId: r.videoId,
        url: ro.url || r.url,
        offsetSec: ro.offsetSec != null ? ro.offsetSec : r.offsetSec,
        eindSec: ro.eindSec != null ? ro.eindSec : null,
        clipVan: ro.clipVan != null ? ro.clipVan : null,
        clipTot: ro.clipTot != null ? ro.clipTot : null,
        exact: ro.exact === true,
        speler: ro.speler, tegenstander: tegen,
        ronde: r.ronde, tafel: r.tafel, toernooi: r.toernooi, soort: r.soort,
        tournamentId: r.tournamentId, datum: r.datum,
      });
    }
  }
  return uit;
}

module.exports = {
  soortVanToernooi,
  wedstrijdenVoorVideo,
  mergeWedstrijden,
  sorteerWedstrijden,
  runoutsUitArchief,
  spelersSleutel,
};
