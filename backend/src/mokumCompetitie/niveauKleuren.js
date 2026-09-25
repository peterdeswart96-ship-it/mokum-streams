// Kleur van de niveau-pil op de competitie-thumbnail. Elk niveau heeft een eigen kleur, zodat
// je op het YouTube-overzicht in één oogopslag ziet welke klasse of divisie het is.
// Bewust geen rood: de datumpil eronder is rood en de pillen moeten te onderscheiden blijven.
// Onbekend niveau (bv. nieuw seizoen) → neutraal grijs, de thumbnail wordt dus nooit geweigerd.

const KLEUR_PER_NIVEAU = {
  Eredivisie: '#c98a00',
  'Eerste Divisie': '#1e6fd9',
  'Derde Divisie Noord-West': '#7b3fc4',
  'Eerste Klasse': '#1f9d55',
  'Tweede Klasse': '#e8720c',
  'Derde Klasse': '#0e8f9c',
};

const STANDAARD_KLEUR = '#5b6470';

function kleurVoorNiveau(niveau) {
  return KLEUR_PER_NIVEAU[String(niveau || '').trim()] || STANDAARD_KLEUR;
}

// Op de thumbnail altijd de korte niveaunaam: "Derde Divisie Noord-West" wordt "Derde Divisie".
// Regio of plaats erachter valt weg; Eredivisie en losse namen blijven zoals ze zijn.
function verkortNiveau(niveau) {
  const n = String(niveau || '').trim().replace(/\s+/g, ' ');
  const m = n.match(/^(\S+ (?:divisie|klasse))\b/i);
  return m ? m[1] : n;
}

// Teamnamen zo kort mogelijk op de thumbnail: een algemeen voorvoegsel als "Biljartvereniging"
// of "Café" en een plaats tussen haakjes vallen weg. Verder blijft de naam ongemoeid — cijfers
// als "2" horen bij de naam (team 1 en 2 van één club moeten te onderscheiden blijven).
// Blijft er niets over, dan houden we de volledige naam.
const TEAM_VOORVOEGSEL = /^(?:biljartvereniging|biljartclub|poolvereniging|poolclub|pool ?team|café|cafe|sportcafé|bv|bc|pv)\s+/i;

function verkortTeamnaam(naam) {
  const oud = String(naam || '').trim().replace(/\s+/g, ' ');
  const kort = oud.replace(/\s*\([^)]*\)\s*/g, ' ').trim().replace(TEAM_VOORVOEGSEL, '').trim();
  return kort || oud;
}

module.exports = { KLEUR_PER_NIVEAU, STANDAARD_KLEUR, kleurVoorNiveau, verkortNiveau, verkortTeamnaam };
