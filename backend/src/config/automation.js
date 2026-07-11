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

// Aparte schakelaar voor het automatische PAUZESCHERM (Jumbotron + Pauzemelding
// tussen wedstrijden, zie docs/pauzescherm-auto.md). Standaard UIT. Los van
// AUTOMATION_ARMED omdat dit alleen overlays toggelt (geen broadcasts maakt/stopt):
// je kunt het pauzescherm dus aanzetten zonder de volledige broadcast-automatisering
// scherp te zetten. Werkt alleen op tafels die de agent als 'streaming' meldt.
function isPauzeAutoOn() {
  return String(process.env.PAUZESCHERM_AUTO || '').toLowerCase() === 'true';
}

module.exports = { isArmed, isPauzeAutoOn };
