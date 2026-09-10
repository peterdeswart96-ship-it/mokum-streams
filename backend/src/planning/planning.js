// Pure planning-logica (planning-model v2, zie docs/api-contract.md v0.4).
// Voegt geïmporteerde Cuescore-toernooien samen met onze opgeslagen
// planning-records: nieuwe krijgen de standaard-instellingen, bestaande behouden
// hun handmatige keuzes. Géén netwerk → unit-testbaar.

// Hoeveel minuten vóór de eerste wedstrijd de uitzending begint. Stond op 10; sinds 05-08
// op 5 (besluit Peter) — tien minuten pauzescherm voor er iets gebeurt is aan de lange kant.
// Per toernooi aan te passen in de Toernooi planner; dit is alleen de startwaarde.
const STANDAARD_PREROLL = 5;

// Eén set standaard-instellingen (alles aan). Wordt ook opgeslagen in
// config/defaults.json en is via het dashboard aan te passen.
const STANDAARD_DEFAULTS = {
  enabled: true,
  // Standaard alleen de twee vaste cameratafels: in ~95% draaien alleen 1 en 3. 15/16
  // voeg je per keer handmatig toe voor een groot toernooi (besluit Peter 27-07). Zo gaan
  // 15/16 niet onnodig leeg live als de loting laat komt.
  tafels: [1, 3],
  preRollMinuten: STANDAARD_PREROLL,
  // Jumbotron staat standaard AAN (#93): een avond begint met het pauzescherm en de
  // highlights, en dat gaat vanzelf uit zodra er op die tafel gespeeld wordt.
  overlays: { sponsors: true, scoreboard: true, jumbotron: true },
  visibility: 'public', // YouTube-zichtbaarheid van de geplande broadcast
};

// Leidt 'YYYY-MM-DD' af uit een ISO-achtige starttijd; anders null.
function afgeleideDatum(start) {
  return typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : null;
}

// True als het event meerdaags is (span > ~1 dag) → een doorlopende competitie/league.
function isMeerdaags(start, stop) {
  if (!start || !stop) return false;
  const a = Date.parse(start);
  const b = Date.parse(stop);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b - a > 26 * 3600 * 1000;
}

// Bepaalt het type op basis van de geplande span.
function bepaalType(startOfRecord, stop) {
  const start = stop === undefined ? (startOfRecord.plannedStart ?? startOfRecord.start) : startOfRecord;
  const eind = stop === undefined ? (startOfRecord.plannedStop ?? startOfRecord.stop) : stop;
  return isMeerdaags(start, eind) ? 'competition' : 'tournament';
}

// Effectieve start = handmatige override, anders de geplande start.
function effectiveStart(record) {
  return record.startOverride || record.plannedStart || null;
}

// Is een planning-record "nu" aan de beurt om een broadcast te maken?
// Alleen enkeldaagse (`tournament`) events; doorlopende competities krijgen
// per-avond-logica (nog te bouwen) en geven hier false.
function planningDue(record, now, { graceMinuten = 30 } = {}) {
  if (!record || record.enabled === false) return false;
  if (!record.planned) return false; // fase 2 (#42): alleen expliciet ingeplande toernooien draaien automatisch
  const type = record.type || bepaalType(record);
  if (type === 'competition') return false;
  const startIso = effectiveStart(record);
  const start = startIso ? Date.parse(startIso) : NaN;
  if (Number.isNaN(start)) return false;
  const preRoll = (record.preRollMinuten == null ? STANDAARD_PREROLL : record.preRollMinuten) * 60000;
  const nu = now.getTime();
  return nu >= start - preRoll && nu <= start + graceMinuten * 60000;
}

function dueRecords(records, now, opts) {
  return (records || []).filter((r) => planningDue(r, now, opts));
}

// Lifecycle-status van een planning-record voor de Toernooi planner (#42 fase 4).
// Puur: kijkt naar de record-vlaggen + de broadcast-stand van vandaag (per tafel,
// broadcasts/<datum>.json) + de datum.
//   'geannuleerd' → expliciet geannuleerd
//   'concept'     → nog niet ingepland (planned=false)
//   'live'        → er draait nu een (niet-gestopte) broadcast van dit toernooi
//   'klaar'       → broadcasts bestonden maar zijn gestopt, of de dag is voorbij
//   'gepland'     → ingepland, nog niet gestart
function planningStatus(record, todayStore, vandaagDatum) {
  if (!record) return 'concept';
  if (record.geannuleerd) return 'geannuleerd';
  if (!record.planned) return 'concept';
  const entries = Object.values(todayStore || {}).filter(
    (e) => e && String(e.tournamentId) === String(record.tournamentId)
  );
  if (entries.some((e) => !e.stopped)) return 'live';
  if (entries.length) return 'klaar';
  const startDatum = afgeleideDatum(effectiveStart(record));
  if (startDatum && vandaagDatum && startDatum < vandaagDatum) return 'klaar';
  return 'gepland';
}

// Maakt een nieuw planning-record voor een geïmporteerd toernooi met de defaults.
function defaultRecord(tournament, defaults = STANDAARD_DEFAULTS) {
  const ov = defaults.overlays || {};
  return {
    tournamentId: tournament.id,
    name: tournament.name || '',
    type: bepaalType(tournament.start, tournament.stop),
    date: tournament.date || afgeleideDatum(tournament.start),
    source: 'cuescore',
    plannedStart: tournament.start || null,
    plannedStop: tournament.stop || null,
    enabled: defaults.enabled !== false,
    startOverride: null,
    stopOverride: null,
    preRollMinuten: defaults.preRollMinuten == null ? STANDAARD_PREROLL : defaults.preRollMinuten,
    tafels: Array.isArray(defaults.tafels) ? [...defaults.tafels] : [],
    overlays: { sponsors: ov.sponsors !== false, scoreboard: ov.scoreboard !== false, jumbotron: ov.jumbotron !== false },
    visibility: defaults.visibility || 'public',
    planned: false, // per-toernooi arm-vlag: pas true na bevestigen in de Toernooi planner
  };
}

// Voegt geïmporteerde toernooien samen met bestaande records.
// - Nieuw toernooi → defaultRecord (standaard-instellingen).
// - Bestaand record → behoud gebruikerskeuzes (enabled, overrides, tafels,
//   overlays, preRoll); ververs alleen de Cuescore-velden (name/plannedStart/stop).
// - Records die niet in de import zitten (ad-hoc, of buiten het venster) blijven.
// - Uitzondering op dat laatste (10-09, incident 09-09): staat er zo'n "niet meer
//   gezien" record, én levert Cuescore een NIEUW ID met dezelfde naam+datum, dan is dat
//   vrijwel zeker hetzelfde toernooi dat Cuescore een ander ID heeft gegeven (bijv. omdat
//   de hele terugkerende reeks opnieuw is aangemaakt — zo ontstonden bij "Mokum MEGA Winter
//   Ranking" #2 t/m #7 zes van dit soort paren, allemaal met exact hetzelfde ID-verschil).
//   Zonder deze check bleef het oude ID voor altijd als een onopvallende dubbelganger in de
//   planner staan — en erger, tafel 1 & 3 raakten op 09-09 zelfs aan zo'n dood ID gekoppeld
//   (geen podium, geen auto-stop, generieke thumbnail). We DRAGEN de handmatige keuzes van
//   het oude record over naar het nieuwe ID, in plaats van het oude record te laten
//   verweesd rondslingeren.
function mergePlanning(existing, imported, defaults = STANDAARD_DEFAULTS) {
  const lijst = existing || [];
  const nieuweLijst = imported || [];
  const byId = new Map(lijst.map((r) => [String(r.tournamentId), r]));
  const geziene = new Set(nieuweLijst.map((t) => String(t.id)));

  // Bestaande records wier ID niet meer in déze import voorkomt, geïndexeerd op
  // naam+datum — kandidaten om te "vervangen" door een nieuw Cuescore-ID hieronder.
  const wezen = new Map();
  for (const r of lijst) {
    if (!geziene.has(String(r.tournamentId)) && r.name && r.date) {
      wezen.set(`${r.name}|${r.date}`, r);
    }
  }
  const vervangenIds = new Set();

  const resultaat = [];
  for (const t of nieuweLijst) {
    const key = String(t.id);
    const oud = byId.get(key);
    if (oud) {
      const nieuweStart = t.start != null ? t.start : oud.plannedStart;
      const nieuweStop = t.stop != null ? t.stop : oud.plannedStop;
      resultaat.push({
        ...oud,
        name: t.name || oud.name,
        type: bepaalType(nieuweStart, nieuweStop), // afgeleid, altijd verversen
        plannedStart: nieuweStart,
        plannedStop: nieuweStop,
        date: oud.date || afgeleideDatum(t.start),
        source: 'cuescore',
      });
      continue;
    }

    const datumNieuw = afgeleideDatum(t.start);
    const wees = t.name && datumNieuw ? wezen.get(`${t.name}|${datumNieuw}`) : null;
    if (wees) {
      vervangenIds.add(String(wees.tournamentId));
      resultaat.push({
        ...wees,
        tournamentId: t.id,
        name: t.name || wees.name,
        type: bepaalType(t.start, t.stop),
        plannedStart: t.start || null,
        plannedStop: t.stop || null,
        date: datumNieuw || wees.date,
        source: 'cuescore',
      });
      continue;
    }

    resultaat.push(defaultRecord(t, defaults));
  }

  for (const r of lijst) {
    const id = String(r.tournamentId);
    if (geziene.has(id) || vervangenIds.has(id)) continue; // al verwerkt, of vervangen door een nieuw ID
    resultaat.push(r);
  }
  return resultaat;
}

module.exports = {
  STANDAARD_DEFAULTS,
  STANDAARD_PREROLL,
  afgeleideDatum,
  isMeerdaags,
  bepaalType,
  effectiveStart,
  planningDue,
  dueRecords,
  defaultRecord,
  mergePlanning,
  planningStatus,
};
