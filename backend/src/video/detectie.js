// Pure detectie-helpers voor de thumbnail (#56): welke spelsoort-bal, welk sponsorlogo,
// en een schoongemaakte titel (sponsor eruit, want die staat al als logo). Géén netwerk →
// unit-testbaar. De finalize-Function combineert deze met de generator.

// Bekende sponsors → logobestand in assets/sponsors. Uitbreidbaar zodra we meer logo's hebben.
const SPONSORS = { buffalo: 'buffalo.png' };

// Spelsoort → welke bal ('1' | '8' | '9' | '10' | '8-10' | null). Bron: Cuescore-veld
// `discipline` ("9-Ball", "10-Ball", "One Pocket", "Multiball"...). De 8&10-combi staat
// meestal alleen in de toernooinaam, dus die checken we daar.
function spelsoortVanDiscipline(discipline, naam = '') {
  const d = String(discipline || '').toLowerCase();
  const n = String(naam || '').toLowerCase();
  if (/(?:8\s*(?:&|en|\/|\+|,)\s*10|10\s*(?:&|en|\/|\+|,)\s*8)/.test(n)) return '8-10';
  if (d.includes('one') && d.includes('pocket')) return '1';
  if (d.includes('10')) return '10';
  if (d.includes('9')) return '9';
  if (d.includes('8')) return '8';
  return null;
}

// Sponsorlogo-bestand op basis van de toernooinaam (bekende sponsor als losse term of na
// "i.s.m."). null als er geen bekende sponsor in de naam staat.
function sponsorVanNaam(naam) {
  const laag = String(naam || '').toLowerCase();
  for (const key of Object.keys(SPONSORS)) {
    if (laag.includes(key)) return SPONSORS[key];
  }
  return null;
}

// Verwijdert een herkende sponsor (met evt. "i.s.m." ervoor) uit de titel — die staat al
// als logo. Strip UITSLUITEND een bekende sponsor, zodat een echte titelwoord nooit sneuvelt.
// De rest (incl. #nummer / staarten) blijft intact; verder inkorten laten we aan de bron over.
function schoneTitel(naam) {
  let t = String(naam || '');
  for (const key of Object.keys(SPONSORS)) {
    const re = new RegExp(`\\s*\\b(?:i\\.?\\s*s\\.?\\s*m\\.?\\s+)?${key}\\b`, 'ig');
    t = t.replace(re, ' ');
  }
  return t.replace(/\s{2,}/g, ' ').trim();
}

module.exports = { spelsoortVanDiscipline, sponsorVanNaam, schoneTitel, SPONSORS };
