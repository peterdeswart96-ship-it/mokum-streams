// Pure logica voor de jumbotron-info-sheets (#72): "Toernooiwinnaars" en "Komende
// toernooien". Géén netwerk → volledig unit-testbaar. De netwerklaag (cuescore + de
// /api/sheets-function) levert genormaliseerde toernooien aan; hier maken we er de
// sheet-rijen van die de jumbotron toont.

const { FINALE_RE } = require('../cuescore/parse');

const MND_KORT = ['', 'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// Datum/tijd in de zaal-tijdzone (Amsterdam), zodat een avondwedstrijd op de juiste dag
// staat en de aanvangstijd lokaal klopt. Puur/deterministisch (Intl met vaste tijdzone).
// Retour: { dag, mnd, jaar, tijd } — lege strings bij een onbruikbare invoer.
function amsterdamDelen(iso, tz = 'Europe/Amsterdam') {
  const leeg = { dag: '', mnd: '', jaar: '', tijd: '' };
  if (!iso) return leeg;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return leeg;
  const delen = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const pak = (t) => (delen.find((p) => p.type === t) || {}).value || '';
  const mnd = Number(pak('month'));
  let uur = pak('hour');
  if (uur === '24') uur = '00'; // en-GB geeft soms '24' voor middernacht
  return { dag: pak('day'), mnd: MND_KORT[mnd] || '', jaar: pak('year'), tijd: `${uur}:${pak('minute')}` };
}

// De winnaar van een afgerond toernooi = wie de FINALE won (hoogste score). Cuescore kent
// de finale als roundName "Final". Er kan meer dan één finale-achtige match zijn
// (dubbel-eliminatie); dan telt de laatst gespeelde. Null als niet vast te stellen (geen
// afgeronde finale, gelijke stand, of ontbrekende speler).
function winnaarUitToernooi(t) {
  const matches = (t && t.matches) || [];
  const finales = matches.filter(
    (m) => FINALE_RE.test((m.roundName || '').trim())
      && m.status === 'finished'
      && m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB
  );
  if (!finales.length) return null;
  const fin = finales[finales.length - 1];
  const winnaar = fin.scoreA > fin.scoreB ? fin.playerA : fin.playerB;
  return (winnaar && winnaar.name) || null;
}

// Eén winnaars-rij uit een genormaliseerd (afgerond) toernooi, of null.
function winnaarRegel(t) {
  const naam = winnaarUitToernooi(t);
  if (!naam) return null;
  const dt = amsterdamDelen(t && t.start);
  return {
    winner: naam,
    toernooi: (t && t.name) || '',
    discipline: (t && t.discipline) || '',
    datum: dt.dag ? `${dt.dag} ${dt.mnd} ${dt.jaar}` : '',
  };
}

// Winnaars-sheet: afgeronde toernooien met een vaststelbare winnaar, nieuwste eerst,
// hoogstens `max`.
function bouwWinnaars(tournaments, { max = 5 } = {}) {
  return (tournaments || [])
    .filter((t) => t && t.finished)
    .map((t) => ({ t, regel: winnaarRegel(t) }))
    .filter((x) => x.regel)
    .sort((a, b) => String(b.t.start || '').localeCompare(String(a.t.start || '')))
    .slice(0, max)
    .map((x) => x.regel);
}

// Eén komende-rij uit een genormaliseerd (gepland) toernooi.
function komendeRegel(t) {
  const dt = amsterdamDelen(t && t.start);
  return {
    dag: dt.dag, mnd: dt.mnd, tijd: dt.tijd,
    naam: (t && t.name) || '', discipline: (t && t.discipline) || '',
  };
}

// Komende-sheet: geplande (niet-afgeronde) toernooien met een starttijd, vroegste eerst,
// hoogstens `max`.
function bouwKomende(tournaments, { max = 5 } = {}) {
  return (tournaments || [])
    .filter((t) => t && !t.finished && t.start)
    .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')))
    .slice(0, max)
    .map(komendeRegel);
}

module.exports = { amsterdamDelen, winnaarUitToernooi, winnaarRegel, bouwWinnaars, komendeRegel, bouwKomende };
