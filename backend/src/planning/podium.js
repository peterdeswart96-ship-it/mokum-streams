// Pure logica voor het podium-eindscherm (winnaar-moment, #54). Leidt het eind-
// klassement af uit de wedstrijden van een toernooi. Géén netwerk/opslag → volledig
// unit-testbaar. De timer-Function (functions/liveMatches.js) doet de fetch + opslag.
//
// Afleiding (werkt voor zowel knock-out als groepsformat, want elk Mokum-toernooi
// eindigt met een Finale + twee halve finales):
//   1e = winnaar van de Finale
//   2e = verliezer van de Finale
//   gedeeld 3e = de verliezers van beide halve finales

const { FINALE_RE } = require('../cuescore/parse');

// Herkent de halve-finale-ronde (Cuescore: "Semi final"; NL-variant voor de zekerheid).
const HALVE_FINALE_RE = /^semi[\s-]?final$|^halve[\s-]?finale$/i;

const isFinished = (m) => String((m && m.status) || '').toLowerCase() === 'finished';
const speler = (p) => (p ? { name: p.name || null, image: p.image || null, flag: p.flag || null } : null);

// Bepaalt winnaar/verliezer van een afgeronde wedstrijd op basis van de stand.
// Bij een gelijke of onbekende stand: beide null (dan tonen we geen podium).
function winnaarVerliezer(m) {
  const a = m && m.scoreA;
  const b = m && m.scoreB;
  if (a == null || b == null || a === b) return { winnaar: null, verliezer: null };
  return a > b
    ? { winnaar: m.playerA, verliezer: m.playerB }
    : { winnaar: m.playerB, verliezer: m.playerA };
}

// Leidt het eindpodium van één (genormaliseerd) toernooi af. Retour: array met
// plekken [{ positie, medaille, speler }] of `null` als de finale nog niet gespeeld is.
function podiumVan(tournament) {
  const matches = (tournament && tournament.matches) || [];
  const finale = matches.find((m) => FINALE_RE.test((m.roundName || '').trim()) && isFinished(m));
  if (!finale) return null;
  const { winnaar, verliezer } = winnaarVerliezer(finale);
  if (!winnaar || !verliezer) return null;

  const derde = matches
    .filter((m) => HALVE_FINALE_RE.test((m.roundName || '').trim()) && isFinished(m))
    .map((m) => winnaarVerliezer(m).verliezer)
    .filter(Boolean)
    .slice(0, 2);

  return [
    { positie: 1, medaille: 'goud', speler: speler(winnaar) },
    { positie: 2, medaille: 'zilver', speler: speler(verliezer) },
    ...derde.map((p) => ({ positie: 3, medaille: 'brons', speler: speler(p) })),
  ];
}

// Kiest het podium dat de gestreamde tafels nu moeten tonen. Kijkt UITSLUITEND naar de
// cameratafels — losse challenges of wedstrijden op niet-gefilmde tafels zijn niet
// relevant (besluit 19-07). Regels:
//   - Speelt er nog een wedstrijd op een CAMERATAFEL? → null (toernooi nog bezig; de
//     spelende tafels tonen hun kaart, idle cameratafels tonen het pauzescherm).
//   - Anders: het laatste afgeronde toernooi dat op een cameratafel werd gespeeld en een
//     gespeelde finale heeft → zijn podium.
// Zo verschijnt het medaillescherm precies zodra de finale klaar is en geen cameratafel
// meer speelt, ongeacht wat er elders in de zaal gebeurt.
function podiumVoorZaal(tournaments, cameraTables) {
  const lijst = tournaments || [];
  const cams = (cameraTables || []).map(Number);
  const opCamera = (m) => cams.includes(Number(m && m.table));

  const cameraSpeelt = lijst.some((t) =>
    ((t && t.matches) || []).some((m) => String((m && m.status) || '').toLowerCase() === 'playing' && opCamera(m))
  );
  if (cameraSpeelt) return null;

  let keuze = null;
  for (const t of lijst) {
    const p = podiumVan(t);
    if (!p) continue;
    // Alleen toernooien die daadwerkelijk op een cameratafel gespeeld werden.
    const gefilmd = ((t && t.matches) || []).some(opCamera);
    if (gefilmd) keuze = { tournamentName: (t && t.name) || '', podium: p }; // laatste wint
  }
  return keuze;
}

// Kiest per CAMERATAFEL welk podium die tafel nu moet tonen (#104). podiumVoorZaal()
// hierboven blokkeert het podium op ELKE cameratafel zodra er ÉÉN cameratafel nog speelt —
// dat klopte toen er meestal maar één toernooi tegelijk op de cameratafels stond, maar een
// avond met bijvoorbeeld een koppeltoernooi op tafel 1&3 én een los toernooi op 15&16 is
// inmiddels normaal. Tafel 1 hoort dan gewoon zijn podium te tonen ook al speelt tafel 15
// nog. Regels per tafel, in volgorde van de toernooienlijst (laatste wint):
//   - Speelt er nog een wedstrijd van DIT toernooi op een van ZIJN EIGEN cameratafels?
//     → die tafels tonen (nog) geen podium.
//   - Anders, als dit toernooi een gespeelde finale heeft → zijn podium op zijn eigen tafels.
// Toernooien die geen enkele cameratafel raken doen niet mee.
function podiumPerTafel(tournaments, cameraTables) {
  const lijst = tournaments || [];
  const cams = (cameraTables || []).map(Number);
  const opCamera = (m) => cams.includes(Number(m && m.table));
  const speelt = (m) => String((m && m.status) || '').toLowerCase() === 'playing';

  const resultaat = {};
  for (const cam of cams) resultaat[cam] = null;

  for (const t of lijst) {
    const matches = (t && t.matches) || [];
    const eigenTafels = [...new Set(matches.filter(opCamera).map((m) => Number(m.table)))];
    if (!eigenTafels.length) continue; // dit toernooi raakt geen enkele cameratafel

    const bezigOpEigenTafel = matches.some((m) => speelt(m) && eigenTafels.includes(Number(m.table)));
    const p = bezigOpEigenTafel ? null : podiumVan(t);
    const waarde = p ? { tournamentName: (t && t.name) || '', podium: p } : null;
    for (const tafel of eigenTafels) resultaat[tafel] = waarde;
  }
  return resultaat;
}

module.exports = { podiumVan, podiumVoorZaal, podiumPerTafel, winnaarVerliezer };
