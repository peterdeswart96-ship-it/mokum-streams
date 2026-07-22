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

// ---------- template-keuze (#56, HTML→PNG) ----------
// Elke bekende Mokum-toernooitemplate is een apart ontwerp in assets/thumbnail-templates.
// Deze functie kiest op basis van de toernooinaam wélke template past. null = geen match →
// de renderer valt terug op de generieke canvas-thumbnail (thumbnail.js). Volgorde =
// prioriteit; specifieke regels (buffalo/summer) staan bewust vóór algemene.
function templateVoorToernooi(naam) {
  const n = String(naam || '').toLowerCase();
  if (n.includes('mega') && n.includes('buffalo')) return 'mega-ranking-buffalo';
  if (n.includes('mega') && n.includes('summer')) return 'mega-summer-ranking';
  if (n.includes('summer') && n.includes('ranking')) return 'mega-summer-ranking'; // ook zonder "MEGA" in de naam (typefout)
  if (/(?:8\s*(?:&|en|\/|\+|,|-)?\s*10|10\s*(?:&|en|\/|\+|,|-)?\s*8)/.test(n)) return '8-10-ball-ranking';
  // 14.1 alleen als het de Mokum Summer League is — niet een NK-kwalificatie o.i.d. die
  // toevallig 14.1 als discipline heeft (die krijgt geen serie-template).
  if (/14[.\-\s]?1(?!\d)/.test(n) && /(summer|league)/.test(n)) return '14-1-summer-league';
  if (n.includes('fluke')) return 'fluke-ranking';
  if (n.includes('speedy') || n.includes('multiball') || n.includes('multi ball') || n.includes('multi-ball')) return 'speedy-multi-ball';
  if (n.includes('handicap')) return 'handicap-madness';
  if (n.includes('blind')) return 'blind-double';
  if (n.includes('best of one') || n.includes('best-of-one')) return 'best-of-one';
  if (n.includes('go customs') || n.includes('customs')) return 'go-customs-amsterdam-open';
  return null;
}

// Vaste, nette weergavetitel (en evt. sponsor-chip) per template. Zo komt de rommelige
// Cuescore-staart (#nummer, "Seizoen X", "9ball") nooit op de thumbnail — de video-titel op
// YouTube houdt de volledige naam. Pas hier een naam aan om de thumbnail-tekst te wijzigen.
const TEMPLATE_TEKST = {
  'fluke-ranking':             { titel: 'Fluke Ranking' },
  'mega-summer-ranking':       { titel: 'MEGA Summer Ranking' },
  'mega-ranking-buffalo':      { titel: 'MEGA Ranking' },              // Buffalo staat al als logo in de template
  '8-10-ball-ranking':         { titel: '8 & 10ball Ranking' },
  '14-1-summer-league':        { titel: '14.1 Summer League' },
  'speedy-multi-ball':         { titel: 'Speedy Multiball' },
  'handicap-madness':          { titel: 'Handicap Madness' },
  'blind-double':              { titel: 'Blind Double' },
  'best-of-one':               { titel: 'Best of One' },
  'go-customs-amsterdam-open': { titel: 'Amsterdam Open', sponsor: 'GO CUSTOMS' },
};

// Korte, hoofdletter-datum voor de datumpil op de thumbnail, bv. "DI 22 JULI".
// (De lange datumNL uit hoofdstukken.js past niet in de pil.)
function datumThumb(iso, tz = 'Europe/Amsterdam') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wd = d.toLocaleDateString('nl-NL', { weekday: 'short', timeZone: tz }).replace('.', '');
  const dm = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: tz });
  return `${wd} ${dm}`.toUpperCase();
}

module.exports = {
  spelsoortVanDiscipline, sponsorVanNaam, schoneTitel, SPONSORS,
  templateVoorToernooi, TEMPLATE_TEKST, datumThumb,
};
