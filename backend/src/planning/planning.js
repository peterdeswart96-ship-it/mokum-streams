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
};

// Leidt 'YYYY-MM-DD' af uit een ISO-achtige starttijd; anders null.
function afgeleideDatum(start) {
  return typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : null;
}

// Maakt een nieuw planning-record voor een geïmporteerd toernooi met de defaults.
function defaultRecord(tournament, defaults = STANDAARD_DEFAULTS) {
  const ov = defaults.overlays || {};
  return {
    tournamentId: tournament.id,
    name: tournament.name || '',
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
      resultaat.push({
        ...oud,
        name: t.name || oud.name,
        plannedStart: t.start != null ? t.start : oud.plannedStart,
        plannedStop: t.stop != null ? t.stop : oud.plannedStop,
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

module.exports = { STANDAARD_DEFAULTS, afgeleideDatum, defaultRecord, mergePlanning };
