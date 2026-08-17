// Pure logica voor het automatisch koppelen van een ad-hoc (handmatig gestarte)
// stream aan het Cuescore-toernooi dat op die tafel speelt. Géén netwerk → testbaar.
//
// Waarom (#69, incident 22-07-2026): een handmatig gestarte stream heeft geen
// tournamentId en wordt daardoor door de hele automatisering overgeslagen — geen
// auto-stop na de finale, geen podium-grace (medaillescherm) en geen finalize
// (thumbnail + hoofdstukken). Zodra we 'm alsnog aan het juiste toernooi hangen,
// loopt de bestaande keten gewoon door alsof de stream vooraf was ingepland.
//
// Bewust conservatief: we koppelen alleen als het ONDUBBELZINNIG is. Bij twijfel
// (twee toernooien met wedstrijden op dezelfde tafel op dezelfde dag) koppelen we
// niet en blijft de stream handmatig — liever geen koppeling dan een verkeerde.
//
// Twee correcties na een echt incident (#103, 15-08-2026):
//   - Tafel 1 & 3 (titel "Very last minute 9 ball") werden gekoppeld aan "Mokum 8 &
//     10ball Ranking", want dat was op dat moment toevallig de ENIGE kandidaat — het
//     last-minute-toernooi was nog niet geloot. Eén kandidaat is dus niet meer
//     automatisch genoeg: deelt de ingetypte titel geen enkel woord met die ene
//     kandidaat, dan koppelen we niet.
//   - Tafel 16 ("Challenge match Leon vs Dev") werd aan een toernooi gekoppeld terwijl
//     een challenge per definitie geen toernooi is. Nooit koppelen als streamType
//     'challenge' is — dat is altijd fout, hier geldt geen "bij twijfel wel".

const { zaalDag } = require('../schedule/schedule');
const { datumInZaal } = require('./league');

const isPlaying = (m) => String((m && m.status) || '').toLowerCase() === 'playing';
const isFinished = (m) => String((m && m.status) || '').toLowerCase() === 'finished';

// Wedstrijden van één toernooi die vandaag (zaal-dag) op deze tafel staan.
function wedstrijdenOpTafel(tournament, tableNumber, now) {
  const tafel = String(tableNumber);
  const vandaag = zaalDag(now);
  return ((tournament && tournament.matches) || []).filter(
    (m) => m && String(m.table) === tafel && m.start && datumInZaal(m.start) === vandaag
  );
}

// Nederlandse stopwoorden + "tafel": tellen niet mee bij het vergelijken van een
// ingetypte titel met een toernooinaam, anders "matcht" alles een beetje met alles.
const NEGEER_WOORDEN = new Set(['de', 'het', 'een', 'in', 'op', 'van', 'voor', 'en', 'of', 'aan', 'met', 'tafel']);

// "Tafel 1 Very last minute 9 ball" -> ['very','last','minute','9','ball']. Haalt het
// tafel-nummer eraf (dat zegt niets over WELK toernooi het is) en normaliseert de rest.
function woorden(s) {
  const zonderTafel = String(s || '').replace(/^\s*tafel\s*\d+\s*/i, '');
  const plat = zonderTafel.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return plat.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter((w) => w && !NEGEER_WOORDEN.has(w));
}

// Hoeveel betekenisvolle woorden delen titel en naam?
function overlapScore(titel, naam) {
  const wt = new Set(woorden(titel));
  return woorden(naam).filter((w) => wt.has(w)).length;
}

// Deelt de ingetypte titel minstens één betekenisvol woord met de toernooinaam?
function deeltWoorden(titel, naam) {
  return overlapScore(titel, naam) > 0;
}

// Kiest, bij meerdere kandidaten, degene wiens naam de MEESTE woorden deelt met de
// ingetypte titel — mits dat er eenduidig één is (geen gelijke stand op de eerste plek).
function kiesOpTitel(kandidaten, titel) {
  if (!titel) return null;
  const gescoord = kandidaten
    .map((k) => ({ tournament: k.tournament, score: overlapScore(titel, k.tournament.name) }))
    .filter((k) => k.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!gescoord.length) return null;
  if (gescoord.length > 1 && gescoord[0].score === gescoord[1].score) return null; // gelijke stand → te onzeker
  return gescoord[0].tournament;
}

// Kiest het toernooi waaraan een ad-hoc stream op `tableNumber` gekoppeld mag worden.
// Voorkeur: het toernooi dat NU op die tafel speelt. Speelt er niets, dan alleen als
// er precies één toernooi vandaag wedstrijden op die tafel heeft. Anders null.
//
// `context.streamType`: bij 'challenge' wordt nooit gekoppeld — een challenge is geen
// toernooi, en die fout is nooit "bij twijfel toch maar wel" waard (#103).
// `context.titel`: de titel die de beheerder heeft ingetypt bij het starten. Weegt mee
// zodra er meer dan één kandidaat is, én als vangrail bij precies één kandidaat: een
// titel die er totaal niets mee te maken heeft ("Very last minute 9 ball" bij "Mokum 8 &
// 10ball Ranking") is een teken dat de ENIGE kandidaat toevallig de verkeerde is.
function kiesToernooiVoorTafel(tournaments, tableNumber, now, context = {}) {
  if (context.streamType === 'challenge') return null;

  const kandidaten = [];
  for (const t of tournaments || []) {
    const opTafel = wedstrijdenOpTafel(t, tableNumber, now);
    if (opTafel.length) kandidaten.push({ tournament: t, speeltNu: opTafel.some(isPlaying) });
  }
  if (!kandidaten.length) return null;

  const spelend = kandidaten.filter((k) => k.speeltNu);
  const poule = spelend.length ? spelend : kandidaten;

  if (poule.length > 1) return kiesOpTitel(poule, context.titel);

  const enige = poule[0].tournament;
  const titelWoorden = woorden(context.titel);
  if (titelWoorden.length && !deeltWoorden(context.titel, enige.name)) return null;
  return enige;
}

// Staat er op deze tafel vandaag nog een niet-afgeronde wedstrijd in een ÁNDER
// toernooi? Zo ja, dan mag een automatisch gekoppelde stream nog niet sluiten —
// bijvoorbeeld twee GO Customs-qualifiers achter elkaar op dezelfde avond.
function anderToernooiNogOpTafel(tournaments, tournamentId, tableNumber, now) {
  return (tournaments || []).some(
    (t) => t && String(t.id) !== String(tournamentId) &&
      wedstrijdenOpTafel(t, tableNumber, now).some((m) => !isFinished(m))
  );
}

module.exports = { kiesToernooiVoorTafel, anderToernooiNogOpTafel, wedstrijdenOpTafel };
