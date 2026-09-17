// Cuescore-toernooi per competitieniveau (#145): een teamwedstrijd staat in Cuescore in het
// "toernooi" van zijn competitie. Alleen daar is de actuele status en stand van één wedstrijd
// te lezen (api.cuescore.com/match/ kent teamwedstrijden niet).
//
// De mokum-competitie-API geeft deze id's niet door, dus ze staan hier vast. Overgenomen uit
// teams.json van het mokum-competitie-project (17-09-2026).
//
// ELK SEIZOEN BIJWERKEN. Staat een niveau er niet in, dan is er geen automatische stop en
// vangt de nachtstop de stream op — er gaat dus niets kapot, het wordt alleen niet netjes.

const SEIZOEN = '2026/2027';

const TOERNOOI_PER_NIVEAU = {
  'Eerste Klasse': 83574424,
  'Tweede Klasse': 83574427,
  'Derde Klasse': 83574403,
  Eredivisie: 83574874,
  'Eerste Divisie': 83574886,
  'Derde Divisie Noord-West': 83574898,
};

function toernooiVoorNiveau(niveau) {
  return TOERNOOI_PER_NIVEAU[String(niveau || '').trim()] || null;
}

module.exports = { SEIZOEN, TOERNOOI_PER_NIVEAU, toernooiVoorNiveau };
