// Pure logica voor de YouTube-hoofdstukken (#56). Bouwt uit de Cuescore-wedstrijden op
// een cameratafel — relatief aan het startmoment van de stream — de tijdstempels die
// YouTube automatisch als hoofdstukken oppakt, plus een nette videobeschrijving.
// Levert ook de ruwe hoofdstuk-data (speler + tijd) die de spelers-index (#59) gebruikt.
// Géén netwerk → volledig unit-testbaar. De finalize-Function haalt de data op en zet 'm.
//
// YouTube-eisen voor auto-hoofdstukken: minstens 3 tijdstempels, de eerste op 0:00,
// oplopend, en elk hoofdstuk minstens ~10s lang.

// Seconden → "M:SS" of "H:MM:SS" (YouTube accepteert beide).
function tijdstempel(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

// Datum uit een ISO-tijd → "zaterdag 19 juli 2026" (zaal-tijdzone).
function datumNL(iso, tz = 'Europe/Amsterdam') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz,
  });
}

// Bouwt de hoofdstuk-data (nog geen tekst): wedstrijden op `tableNumber`, gesorteerd op
// starttijd, met de offset (in seconden) t.o.v. het streambegin. Wedstrijden die ruim
// vóór de stream begonnen vallen weg; een die net ervoor begon telt mee op 0:00.
function hoofdstukData(streamStartISO, tournament, tableNumber, opts = {}) {
  const start = Date.parse(streamStartISO);
  if (Number.isNaN(start)) return [];
  const tafel = String(tableNumber);
  const margeSec = opts.margeSec != null ? opts.margeSec : 120;
  const minGapSec = opts.minGapSec != null ? opts.minGapSec : 10; // YouTube: hoofdstuk >= ~10s

  const rijen = ((tournament && tournament.matches) || [])
    .filter((m) => m && m.table === tafel && m.start)
    .map((m) => ({ m, t: Date.parse(m.start) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);

  const uit = [];
  for (const { m, t } of rijen) {
    const offset = Math.floor((t - start) / 1000);
    if (offset < -margeSec) continue; // ruim vóór de stream
    const sec = Math.max(0, offset);
    const a = m.playerA && m.playerA.name;
    const b = m.playerB && m.playerB.name;
    if (!a && !b) continue;
    // Strikt oplopend met minimaal een klein gat (anders pakt YouTube de hoofdstukken niet).
    const vorige = uit[uit.length - 1];
    const secGecorrigeerd = vorige && sec - vorige.offsetSec < minGapSec ? vorige.offsetSec + minGapSec : sec;
    uit.push({
      offsetSec: secGecorrigeerd,
      spelers: [a, b].filter(Boolean),
      label: `${a || '?'} vs ${b || '?'}`,
      round: m.roundName || null,
    });
  }
  return uit;
}

// Bouwt de complete videobeschrijving met hoofdstukken. Retour:
// { beschrijving, hoofdstukken } — hoofdstukken = hoofdstukData (voor #59).
function bouwHoofdstukken(streamStartISO, tournament, tableNumber, opts = {}) {
  const hoofdstukken = hoofdstukData(streamStartISO, tournament, tableNumber, opts);

  // Zorg dat het eerste hoofdstuk op 0:00 staat (YouTube-eis).
  const metNul = hoofdstukken.length && hoofdstukken[0].offsetSec === 0
    ? hoofdstukken
    : [{ offsetSec: 0, spelers: [], label: opts.introLabel || 'Aanvang', round: null }, ...hoofdstukken];

  const naam = (tournament && tournament.name) || opts.titel || '';
  const tafelLabel = `Tafel ${tableNumber}`;
  const datum = datumNL(streamStartISO, opts.tz);

  const kop = [naam, tafelLabel, datum].filter(Boolean).join(' — ');
  const regels = metNul.map((h) => `${tijdstempel(h.offsetSec)} ${h.label}`);

  const beschrijving = [
    kop,
    '',
    'Hoofdstukken:',
    ...regels,
    '',
    'Automatisch gegenereerd • Mokum Pool & Darts',
  ].join('\n');

  return { beschrijving, hoofdstukken };
}

module.exports = { bouwHoofdstukken, hoofdstukData, tijdstempel, datumNL };
