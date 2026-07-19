// Pure planning-logica (planning-model v2, zie docs/api-contract.md v0.4).
// Voegt geïmporteerde Cuescore-toernooien samen met onze opgeslagen
// planning-records: nieuwe krijgen de standaard-instellingen, bestaande behouden
// hun handmatige keuzes. Géén netwerk → unit-testbaar.

// Eén set standaard-instellingen (alles aan). Wordt ook opgeslagen in
// config/defaults.json en is via het dashboard aan te passen.
const STANDAARD_DEFAULTS = {
  enabled: true,
  tafels: [1, 3, 15, 16],
  preRollMinuten: 10,
  overlays: { sponsors: true, scoreboard: true },
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
  const preRoll = (record.preRollMinuten == null ? 10 : record.preRollMinuten) * 60000;
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
    preRollMinuten: defaults.preRollMinuten == null ? 10 : defaults.preRollMinuten,
    tafels: Array.isArray(defaults.tafels) ? [...defaults.tafels] : [],
    overlays: { sponsors: ov.sponsors !== false, scoreboard: ov.scoreboard !== false },
    visibility: defaults.visibility || 'public',
    planned: false, // per-toernooi arm-vlag: pas true na bevestigen in de Toernooi planner
  };
}

// Voegt geïmporteerde toernooien samen met bestaande records.
// - Nieuw toernooi → defaultRecord (standaard-instellingen).
// - Bestaand record → behoud gebruikerskeuzes (enabled, overrides, tafels,
//   overlays, preRoll); ververs alleen de Cuescore-velden (name/plannedStart/stop).
// - Records die niet in de import zitten (ad-hoc, of buiten het venster) blijven.
function mergePlanning(existing, imported, defaults = STANDAARD_DEFAULTS) {
  const byId = new Map((existing || []).map((r) => [String(r.tournamentId), r]));
  const resultaat = [];
  const geziene = new Set();

  for (const t of imported || []) {
    const key = String(t.id);
    geziene.add(key);
    const oud = byId.get(key);
    if (!oud) {
      resultaat.push(defaultRecord(t, defaults));
    } else {
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
    }
  }

  for (const r of existing || []) {
    if (!geziene.has(String(r.tournamentId))) resultaat.push(r);
  }
  return resultaat;
}

module.exports = {
  STANDAARD_DEFAULTS,
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
