// Pure logica voor de agent-commandowachtrij (opslag: commands.json). De
// function-laag doet lezen/schrijven en id-/tijd-generatie. Géén netwerk → testbaar.

const GELDIGE_TYPES = new Set(['startStream', 'stopStream', 'setOverlay', 'refreshSource']);

// Standaard OBS-bronnamen voor de schakelbare overlays (zie docs/obs-standaard.md +
// api-contract v0.9/v0.11). Content-overlays staan standaard aan; break-overlays
// (Jumbotron, zie OVERLAY_DEFAULT_OFF) standaard uit. Per broadcast/live
// te toggelen vanuit het dashboard. 'Camera Tafel N' staat altijd aan (geen schakelaar).
const OVERLAY_BRON = {
  sponsors: 'Sponsor slideshow',
  scoreboard: 'Scoreboard',
  jumbotron: 'Jumbotron',
  // Competitiescherm (#147): stand + uitslagen van de afgelopen maand, in de laatste
  // minuten van een competitiestream. checkStops zet 'm aan; zie competitieSchermCommando.
  competitie: 'Competitiestand',
};
// NB: 'scoresOtherTables' ('Scores other tables') én 'cuescoreLogo' ('Cuescore logo') zijn
// per 2026-07-13 verwijderd, 'pauzemelding' ('Pauzemelding') per 2026-09-21 (#151: de bron bestond
// in geen enkele OBS-instantie meer; de pauze-slides zitten nu in de Jumbotron-bron) — de officiële Cuescore-scoreboard-overlay dekt beide. Terug te
// zetten door de sleutel hier + in agent DEFAULT_OVERLAY_SOURCES + frontend OVERLAYS weer toe
// te voegen én de OBS-bron.

// Break-overlays staan standaard UIT: ze horen alleen tijdens een pauze in beeld
// (de Jumbotron toont de pauze-slides: alle tafels live + "we wachten op de volgende wedstrijd").
// Het competitiescherm hoort daar ook bij: het gaat alleen aan als de teamwedstrijd klaar is,
// en elke nieuwe start zet het dus weer uit.
const OVERLAY_DEFAULT_OFF = new Set(['jumbotron', 'competitie']);

// Bouwt de commando's om een tafel te starten: OBS laten zenden + elke overlay op de
// gewenste stand zetten. Standaard aan, behalve break-overlays (OVERLAY_DEFAULT_OFF);
// een expliciete boolean in record.overlays wint altijd. Itereert over overlayBron zodat
// een extra overlay alleen daar hoeft te worden toegevoegd. Zonder id/tijd — die voegt
// de function-laag toe.
//
// opts.preflight (#43): markeer de startStream als AUTOMATISCH, zodat de agent eerst
// controleert of de camera live beeld geeft vóór hij OBS laat zenden. Alleen voor de
// timer-automatisering (createBroadcasts); handmatige starts vanaf het dashboard laten
// dit weg — daar kijkt een mens naar de preview.
// Competitiestream (#153): het Cuescore-scorebord kijkt per TAFEL (`?tableId=...`), maar bij een
// teamwedstrijd heeft Cuescore geen tafeldata (`table: []`, `frames: []`) - alleen de teamstand op
// de wedstrijd zelf. Wat er dan in beeld komt is een losse challenge die iemand op die tafel heeft
// gezet en die niemand bijhoudt: op 21-09 stond er zo 3,5 uur lang 0-0 op drie streams. Het gaat
// soms wel goed (17-09) - namelijk als spelers hun challenges toevallig wel bijwerken - en juist
// die onvoorspelbaarheid maakt het onbruikbaar. Beter geen stand dan een foute stand; de teamstand
// krijgt een eigen balk (#154). Een expliciete `overlays.scoreboard: true` verliest hier bewust:
// de wizard stuurt die standaard mee, en die keuze hoort niet per stream opnieuw gemaakt te worden.
// Met de hand aanzetten kan nog steeds via POST /api/manage/streams/overlay.
function isCompetitie(record) {
  return String((record && record.streamType) || '') === 'competitie';
}

function startCommandsFor(record, tableNumber, overlayBron = OVERLAY_BRON, opts = {}) {
  const ov = (record && record.overlays) || {};
  const competitie = isCompetitie(record);
  const startCmd = { type: 'startStream', tableNumber };
  if (opts.preflight) startCmd.preflight = true;
  const overlayCmds = Object.entries(overlayBron).map(([sleutel, sourceName]) => ({
    type: 'setOverlay',
    tableNumber,
    sourceName,
    enabled: competitie && sleutel === 'scoreboard'
      ? false
      : (typeof ov[sleutel] === 'boolean' ? ov[sleutel] : !OVERLAY_DEFAULT_OFF.has(sleutel)),
  }));
  const cmds = [startCmd, ...overlayCmds];
  // Ververs het scorebord bij de start (als het aan staat): anders houdt de OBS-browserbron
  // de vorige-toernooi-pagina vast tot de eerste pauze-omslag. Zo staat er meteen het juiste
  // toernooi op — geen handmatige cache-leging meer nodig.
  // Verversen bij de start geldt voor ELKE webpagina-overlay die aan gaat, niet alleen het
  // scorebord. Een browserbron in OBS houdt de pagina vast die hij ooit geladen heeft: de
  // pc staat 24/7 aan en de bron herlaadt zichzelf niet. Zonder dit draait de jumbotron na
  // een wijziging nog wekenlang de oude versie (gezien 05-08, toen de rotatievolgorde was
  // aangepast maar OBS de oude pagina bleef tonen).
  for (const sleutel of ['scoreboard', 'jumbotron']) {
    const bron = overlayBron[sleutel];
    if (!bron) continue;
    if (overlayCmds.some((c) => c.sourceName === bron && c.enabled)) {
      cmds.push({ type: 'refreshSource', tableNumber, sourceName: bron });
    }
  }
  return cmds;
}

// Competitiescherm aanzetten (#147): gebruikt door checkStops zodra een teamwedstrijd klaar
// is, aan het begin van de wachttijd vóór de automatische stop. Géén refreshSource: de
// OBS-bron staat op "uitschakelen als niet zichtbaar", dus hij laadt vers bij het aanzetten.
function competitieSchermCommando(tableNumber, overlayBron = OVERLAY_BRON) {
  return { type: 'setOverlay', tableNumber: Number(tableNumber), sourceName: overlayBron.competitie, enabled: true };
}

// Verwijdert de commando's die de agent als verwerkt heeft bevestigd.
function removeProcessed(commands, verwerkteIds) {
  const set = new Set(verwerkteIds || []);
  return (commands || []).filter((c) => !set.has(c.id));
}

// Voegt één of meer commando's achteraan de wachtrij toe.
function enqueue(commands, nieuwe) {
  const lijst = Array.isArray(nieuwe) ? nieuwe : [nieuwe];
  return [...(commands || []), ...lijst];
}

// Is een tafel vandaag al bezet? Een entry telt alleen als bezet zolang 'ie niet
// gestopt is — een gestopte/afgelopen stream geeft de camera weer vrij.
function isTableBusy(broadcastsStore, tableNumber) {
  const s = broadcastsStore || {};
  const entry = s[String(tableNumber)] || s[tableNumber];
  return !!(entry && !entry.stopped);
}

module.exports = { GELDIGE_TYPES, OVERLAY_BRON, isCompetitie, startCommandsFor, competitieSchermCommando, removeProcessed, enqueue, isTableBusy };
