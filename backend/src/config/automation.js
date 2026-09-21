// Veiligheidsschakelaar voor de timer-automatisering.
//
// Standaard UIT. De timer-Functions (createBroadcasts + checkStops) maken/stoppen
// pas broadcasts als de app-setting AUTOMATION_ARMED expliciet op "true" staat.
// Zo staat het systeem na een deploy **slapend**: geïmporteerde toernooien worden
// wél getoond (dashboard/schedule), maar er wordt NIETS automatisch op YouTube
// aangemaakt of gestopt tot we bewust "scherp" zetten (agent draait + productie-klaar).
//
// Handmatige bediening via /api/manage/streams/* (dashboard) werkt ALTIJD, los van
// deze schakelaar — dat is immers een bewuste actie van een beheerder.
function isArmed() {
  return String(process.env.AUTOMATION_ARMED || '').toLowerCase() === 'true';
}

// Aparte schakelaar voor het automatische PAUZESCHERM (de Jumbotron-slides
// tussen wedstrijden, zie docs/pauzescherm-auto.md). Standaard UIT. Los van
// AUTOMATION_ARMED omdat dit alleen overlays toggelt (geen broadcasts maakt/stopt):
// je kunt het pauzescherm dus aanzetten zonder de volledige broadcast-automatisering
// scherp te zetten. Werkt alleen op tafels die de agent als 'streaming' meldt.
function isPauzeAutoOn() {
  return String(process.env.PAUZESCHERM_AUTO || '').toLowerCase() === 'true';
}

// Welke overlays het automatische pauzescherm aan/uit zet, als komma-gescheiden
// app-setting PAUZESCHERM_KEYS. Standaard 'jumbotron': dat is sinds #151 de enige
// pauze-bron die nog bestaat (de eigen pauze-slides draaien erin, dus het bezwaar uit
// #54 — de Cuescore-jumbotron met zijn niet weg te krijgen instellingenvenster — geldt
// niet meer). Die waarde staat ook zo in productie, dus code en app-setting zeggen
// hetzelfde: wie de setting weghaalt, houdt een werkend pauzescherm. Onbekende sleutels
// worden verderop stil overgeslagen (pauzeCommandos filtert op OVERLAY_BRON).
function pauzeSchermKeys() {
  const raw = String(process.env.PAUZESCHERM_KEYS || '').trim();
  if (!raw) return ['jumbotron'];
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  return keys.length ? keys : ['jumbotron'];
}

// Inverse van pauzeSchermKeys: overlays die tijdens SPELEN aan moeten en bij een
// pauze/idle UIT — bijv. het Cuescore-scoreboard, dat anders een oud/afgelopen
// toernooi blijft tonen zolang er geen nieuwe wedstrijd op de tafel staat (#54).
// Komma-gescheiden app-setting PAUZESCHERM_UIT; standaard leeg (geen inverse
// toggling) tot 'ie expliciet gezet wordt.
function pauzeSchermUitKeys() {
  const raw = String(process.env.PAUZESCHERM_UIT || '').trim();
  if (!raw) return [];
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

// Overlays die bij elke play/pauze-omslag VERVERST moeten worden (cache-refresh van de
// browserbron), zodat het Cuescore-scorebord oude toernooi-info opruimt en fris terugkomt
// bij de volgende wedstrijd (#54). Komma-gescheiden app-setting PAUZESCHERM_REFRESH;
// standaard leeg.
function pauzeSchermRefreshKeys() {
  const raw = String(process.env.PAUZESCHERM_REFRESH || '').trim();
  if (!raw) return [];
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

// Schakelaar voor de automatische stop op INACTIVITEIT (#100 / #105): een uitzending
// sluiten omdat er een uur lang geen wedstrijd op die tafel te zien was. Standaard UIT
// (besluit Peter 17-09, #134).
//
// Waarom uit: de regel kijkt naar `venueTables` uit Cuescore, en een stream zonder
// Cuescore-koppeling staat daar NOOIT als 'playing' in — ook niet terwijl er gewoon
// gespeeld wordt. De regel kapte daardoor drie keer een lopende wedstrijd af: #121
// (challenge "Gurps vs Dylan", 08-09) en op 16-09 tafel 15 én 16 midden in de
// teamwedstrijd Moko Loco vs. MRE (#130). Een afgekapte wedstrijd is erger dan een
// stream die te lang doorloopt.
//
// Wat het vangnet nu is: de nachtstop van 02:00 (planning/nachtstop.js) stopt ALLES wat
// nog open staat, ook ad-hoc en handmatig gestarte streams, en hangt niet van Cuescore af.
// Een vergeten stream loopt dus tot uiterlijk 02:00 in plaats van eindeloos — dat is de
// bewuste ruil. De logica blijft staan zodat 'ie zonder deploy terug kan.
function isInactiviteitsStopAan() {
  return String(process.env.INACTIVITEIT_STOP || '').toLowerCase() === 'true';
}

// Schakelaar voor de harde tijdslimiet op CHALLENGE-streams (planning/challengeLimiet.js):
// stoppen na X uur, ongeacht of er nog gespeeld wordt. Standaard UIT (besluit Peter 17-09,
// #134) — om dezelfde reden als hierboven: het kapte lopende partijen af. Was eerder 2 uur
// (besluit 18-08), daarna 3 uur (10-09), nu helemaal uit.
function isChallengeLimietAan() {
  return String(process.env.CHALLENGE_LIMIET || '').toLowerCase() === 'true';
}

// Wachttijd tussen "competitiewedstrijd klaar" en stoppen (#145, besluit 17-09: 5 minuten),
// in ms. Op één plek, omdat checkStops er de stop op baseert en /api/live er het
// stoptijdstip voor het bedankscherm (#147) uit berekent — die twee moeten gelijk lopen.
function competitieWachtMs() {
  return (Number(process.env.COMPETITIE_STOP_WACHT_MIN) || 5) * 60 * 1000;
}

module.exports = {
  isArmed, isPauzeAutoOn, pauzeSchermKeys, pauzeSchermUitKeys, pauzeSchermRefreshKeys,
  isInactiviteitsStopAan, isChallengeLimietAan, competitieWachtMs,
};
