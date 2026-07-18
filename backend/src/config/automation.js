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

// Welke overlays het automatische pauzescherm aan/uit zet, als komma-gescheiden
// app-setting PAUZESCHERM_KEYS. Standaard alléén 'pauzemelding' — de Cuescore-
// jumbotron dwingt een instellingenvenster af dat mee de uitzending in gaat en niet
// weg te krijgen is (zie #54). Zodra we een eigen tafelraster hebben, kan dit naar
// bijv. "jumbotron,pauzemelding" zonder opnieuw te deployen. Onbekende sleutels
// worden verderop stil overgeslagen (pauzeCommandos filtert op OVERLAY_BRON).
function pauzeSchermKeys() {
  const raw = String(process.env.PAUZESCHERM_KEYS || '').trim();
  if (!raw) return ['pauzemelding'];
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  return keys.length ? keys : ['pauzemelding'];
}

module.exports = { isArmed, isPauzeAutoOn, pauzeSchermKeys };
