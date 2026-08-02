// Sjablonen voor challenges (#90) — pure logica, geen netwerk/opslag → unit-testbaar.
//
// Een sjabloon is een opgeslagen setje instellingen ("Lennert — 9-ball race 5, winner
// break") zodat een lid niet elke keer het hele formulier hoeft in te vullen. Dit bestand
// bewaakt wat er de opslag in mag: alles komt van een webpagina, dus niets vertrouwen.

const MAX_SJABLONEN = 12;
const MAX_NAAM = 40;
const MAX_RACE = 200;   // 14.1 gaat tot 100+; ruim genomen
// De twee breakregels die Cuescore kent (zie het aanmaakformulier op hun scorebord).
// winner break = wie de partij wint mag opnieuw breken; alternate = om en om.
const BREAKRULES = ['winner', 'alternate'];
const BREAKRULE_LABELS = { winner: 'Winner break', alternate: 'Alternate break' };

// Spelsoorten met hun Cuescore-nummer, uitgelezen uit CueScore.Discipline in hun eigen
// bibliotheek. Alleen 9-Ball (3) is live geverifieerd; de rest komt uit hun code en is dus
// betrouwbaar, maar nog niet in de praktijk aangemaakt.
//
// Dit is een selectie die past bij wat er in Mokum staat: zestien pooltafels, twee English
// pool-tafels (17/18) en een carambolebiljart (19). Cuescore kent er veel meer (snooker,
// Russisch piramide, Braziliaanse varianten); die laten we weg om de lijst bruikbaar te
// houden. Onbekende nummers weigeren we niet — het moet alleen een getal zijn.
const DISCIPLINES = {
  1: '7-Ball',
  2: '8-Ball',
  3: '9-Ball',
  4: '10-Ball',
  5: '14.1 (straight pool)',
  6: 'One pocket',
  7: 'Bank pool',
  10: 'Multiball',
  201: 'Eén band (carambole)',
  202: 'Driebanden (carambole)',
  203: 'Libre (carambole)',
  301: 'Blackball (English pool)',
  302: 'World rules (English pool)',
};

const STANDAARD = {
  naam: '9-ball race 5',
  discipline: 3,
  raceTo: 5,
  breakrule: 'winner',
};

function schoonNaam(waarde, terugval) {
  const s = String(waarde == null ? '' : waarde).replace(/\s+/g, ' ').trim();
  return (s || terugval).slice(0, MAX_NAAM);
}

// Eén sjabloon opschonen. Retour: een geldig sjabloon, of null als er niets bruikbaars is.
function normaliseerSjabloon(rauw) {
  if (!rauw || typeof rauw !== 'object') return null;

  const raceTo = Math.round(Number(rauw.raceTo));
  const discipline = Math.round(Number(rauw.discipline));
  if (!Number.isFinite(raceTo) || raceTo < 1 || raceTo > MAX_RACE) return null;
  if (!Number.isFinite(discipline) || discipline < 1) return null;

  const tegenstanderId = Number(rauw.tegenstanderId);
  return {
    naam: schoonNaam(rauw.naam, `${DISCIPLINES[discipline] || 'challenge'} race ${raceTo}`),
    discipline,
    raceTo,
    breakrule: BREAKRULES.includes(rauw.breakrule) ? rauw.breakrule : 'winner',
    // Een vaste tegenstander is optioneel: "Lennert — 9-ball race 5" is één tik, een
    // sjabloon zonder tegenstander vraagt er nog om.
    ...(Number.isFinite(tegenstanderId) && tegenstanderId > 0
      ? { tegenstanderId, tegenstanderNaam: schoonNaam(rauw.tegenstanderNaam, 'tegenstander') }
      : {}),
  };
}

// Een hele lijst opschonen: rommel eruit, begrensd op MAX_SJABLONEN, dubbele namen weg.
function normaliseerSjablonen(rauw) {
  const uit = [];
  const gezien = new Set();
  for (const s of Array.isArray(rauw) ? rauw : []) {
    const g = normaliseerSjabloon(s);
    if (!g) continue;
    const sleutel = `${g.naam.toLowerCase()}|${g.tegenstanderId || ''}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(g);
    if (uit.length >= MAX_SJABLONEN) break;
  }
  return uit;
}

module.exports = {
  normaliseerSjabloon, normaliseerSjablonen, STANDAARD,
  DISCIPLINES, BREAKRULES, BREAKRULE_LABELS, MAX_SJABLONEN, MAX_NAAM, MAX_RACE,
};
