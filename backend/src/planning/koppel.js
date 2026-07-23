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

const { zaalDelen } = require('../schedule/schedule');
const { datumInZaal } = require('./league');

const isPlaying = (m) => String((m && m.status) || '').toLowerCase() === 'playing';
const isFinished = (m) => String((m && m.status) || '').toLowerCase() === 'finished';

// Wedstrijden van één toernooi die vandaag (zaal-dag) op deze tafel staan.
function wedstrijdenOpTafel(tournament, tableNumber, now) {
  const tafel = String(tableNumber);
  const vandaag = zaalDelen(now).datum;
  return ((tournament && tournament.matches) || []).filter(
    (m) => m && String(m.table) === tafel && m.start && datumInZaal(m.start) === vandaag
  );
}

// Kiest het toernooi waaraan een ad-hoc stream op `tableNumber` gekoppeld mag worden.
// Voorkeur: het toernooi dat NU op die tafel speelt. Speelt er niets, dan alleen als
// er precies één toernooi vandaag wedstrijden op die tafel heeft. Anders null.
function kiesToernooiVoorTafel(tournaments, tableNumber, now) {
  const kandidaten = [];
  for (const t of tournaments || []) {
    const opTafel = wedstrijdenOpTafel(t, tableNumber, now);
    if (opTafel.length) kandidaten.push({ tournament: t, speeltNu: opTafel.some(isPlaying) });
  }
  if (!kandidaten.length) return null;

  const spelend = kandidaten.filter((k) => k.speeltNu);
  if (spelend.length === 1) return spelend[0].tournament;
  if (spelend.length > 1) return null;          // twee toernooien op één tafel → te onzeker
  return kandidaten.length === 1 ? kandidaten[0].tournament : null;
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
