// Opslag van de agent-commandowachtrij (commands.json) mét botsingsbeveiliging.
//
// Waarom (07-10): commands.json werd door ruim acht plekken bijgewerkt met "lezen, aanpassen,
// terugschrijven" zonder te controleren of het bestand ondertussen veranderd was. Schreef de agent
// (die na elke bevestiging de wachtrij opschoont) of een andere timer in dat korte venster, dan
// overschreef de laatste schrijver de eerste en verdwenen commando's spoorloos. Op 07-10 gebeurde
// dat met het uit-commando van de pauzescherm-timer: de jumbotron bleef bij T1 en T3 een half uur
// in beeld terwijl er gespeeld werd (agent.log kent die commando's niet).
//
// updateJson (storage/blob.js) schrijft alleen als de ETag nog klopt en probeert anders opnieuw
// met de verse inhoud. Alle schrijvers horen via deze twee functies te lopen.

const { updateJson } = require('../storage/blob');
const { enqueue, removeProcessed } = require('./commandQueue');

const PAD = 'commands.json';

// Zet één of meer commando's achteraan de wachtrij. Geeft de nieuwe wachtrij terug.
async function voegCommandosToe(nieuwe) {
  return updateJson(PAD, (huidig) => enqueue(Array.isArray(huidig) ? huidig : [], nieuwe), []);
}

// Haalt bevestigde commando's uit de wachtrij. Geeft de nieuwe wachtrij terug.
async function verwijderVerwerkt(ids) {
  return updateJson(PAD, (huidig) => removeProcessed(Array.isArray(huidig) ? huidig : [], ids), []);
}

module.exports = { voegCommandosToe, verwijderVerwerkt };
