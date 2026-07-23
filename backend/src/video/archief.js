// Pure logica voor het wedstrijd-archief (#59/#67): elke wedstrijd die we gefilmd hebben,
// met een deep-link naar het exacte moment in de video. Voedt zowel de zoekmachine op de
// Mokum Live-pagina als het run-out-overzicht (dat is simpelweg een filter hierop).
// Géén netwerk/opslag → volledig unit-testbaar.
//
// Waarom deep-links en geen clips: YouTube kent geen clip- of timestamp-playlists
// (startAt/endAt zijn afgeschaft). Knippen + her-uploaden kost 1.600 quota-eenheden per
// clip. Besluit 22-07 (#67): fase 1 = links naar het moment in de bestaande video.
//
// Koppeling video ↔ wedstrijd gaat via het SPELERSPAAR uit de hoofdstukken die bij het
// finaliseren zijn weggeschreven (`video-index/<videoId>.json`); die bevatten al de offset
// in seconden t.o.v. het begin van de stream. Zo werkt dit ook voor video's die al
// gefinaliseerd waren vóór dit issue — de index hoeft niet herschreven te worden.

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

// Clipvenster voor het afspelen van een run-out (#71). De rackduur telt vanaf het einde van
// het vórige rack, dus de eerste minuut is meestal ballen opzetten. We tellen daarom terug
// vanáf het einde: korte racks houden hun aanloop, lange worden getrimd tot de run zelf.
const CLIP_MAX_SEC = 150; // hoever we maximaal terugtellen vanaf de laatste bal
const CLIP_NA_SEC = 4;    // naloop, zodat de clip niet op de bal zelf afkapt

function clipVenster(startSec, eindSec) {
  if (eindSec == null) return { clipVan: null, clipTot: null };
  return {
    clipVan: Math.max(0, Math.max(startSec, eindSec - CLIP_MAX_SEC)),
    clipTot: eindSec + CLIP_NA_SEC,
  };
}

// Bouwt de archiefregels van één video. `indexRecord` = video-index/<id>.json,
// `tournament` = genormaliseerd Cuescore-toernooi. Retour: array (kan leeg zijn).
function wedstrijdenVoorVideo(indexRecord, tournament) {
  const rec = indexRecord || {};
  if (!rec.videoId) return [];
  const tafel = String(rec.tableNumber);

  // Offset per spelerspaar uit de al bewaarde hoofdstukken.
  const offsetPerPaar = new Map();
  for (const h of rec.hoofdstukken || []) {
    const sleutel = spelersSleutel(h && h.spelers);
    // Eerste voorkomen wint (een paar speelt zelden twee keer op dezelfde tafel).
    if (sleutel && !offsetPerPaar.has(sleutel)) offsetPerPaar.set(sleutel, h.offsetSec);
  }

  const naamToernooi = rec.tournamentName || (tournament && tournament.name) || '';

  const uit = [];
  for (const m of (tournament && tournament.matches) || []) {
    if (!m || String(m.table) !== tafel) continue;
    const a = (m.playerA && m.playerA.name) || null;
    const b = (m.playerB && m.playerB.name) || null;
    const offset = offsetPerPaar.get(spelersSleutel([a, b]));
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
