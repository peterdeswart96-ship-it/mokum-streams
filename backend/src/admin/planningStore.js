// Pure store-logica voor de admin-endpoints (dashboard). Géén netwerk/opslag →
// unit-testbaar. De HTTP-functions (functions/admin.js) doen alleen lezen/schrijven
// van de Blob-JSON en roepen deze functies aan.

// Velden die het dashboard aan een planning-record mag wijzigen.
const TOEGESTAAN = ['enabled', 'startOverride', 'stopOverride', 'preRollMinuten', 'tafels', 'overlays', 'visibility', 'planned', 'geannuleerd'];

// Geldige YouTube-zichtbaarheden; onbekende waarde valt terug op 'public'.
const ZICHTBAARHEDEN = ['public', 'unlisted', 'private'];
function normaliseerVisibility(v) {
  return ZICHTBAARHEDEN.includes(v) ? v : 'public';
}

function normaliseerTafels(v) {
  if (!Array.isArray(v)) throw new Error('tafels moet een array zijn');
  return v.map(Number).filter((n) => Number.isInteger(n));
}

function normaliseerPreRoll(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('preRollMinuten moet een getal >= 0 zijn');
  return n;
}

function normaliseerOverlays(patch, huidig) {
  const o = patch || {};
  const h = huidig || {};
  return {
    sponsors: o.sponsors !== undefined ? !!o.sponsors : h.sponsors !== false,
    scoreboard: o.scoreboard !== undefined ? !!o.scoreboard : h.scoreboard !== false,
  };
}

// Past een patch toe op één planning-record (alleen toegestane velden).
function applyPlanningPatch(record, patch) {
  const uit = { ...record };
  for (const k of TOEGESTAAN) {
    if (!(k in (patch || {}))) continue;
    if (k === 'tafels') uit.tafels = normaliseerTafels(patch.tafels);
    else if (k === 'overlays') uit.overlays = normaliseerOverlays(patch.overlays, record.overlays);
    else if (k === 'enabled') uit.enabled = !!patch.enabled;
    else if (k === 'planned') uit.planned = !!patch.planned;
    else if (k === 'geannuleerd') uit.geannuleerd = !!patch.geannuleerd;
    else if (k === 'visibility') uit.visibility = normaliseerVisibility(patch.visibility);
    else if (k === 'preRollMinuten') uit.preRollMinuten = normaliseerPreRoll(patch.preRollMinuten);
    else uit[k] = patch[k] === null || patch[k] === '' ? null : String(patch[k]); // start/stopOverride
  }
  return uit;
}

// Zoekt het record op id en past de patch toe. Retour { planning, record } of null.
function updatePlanningRecord(planning, id, patch) {
  const lijst = planning || [];
  const idx = lijst.findIndex((r) => String(r.tournamentId) === String(id));
  if (idx === -1) return null;
  const bijgewerkt = applyPlanningPatch(lijst[idx], patch);
  const kopie = lijst.slice();
  kopie[idx] = bijgewerkt;
  return { planning: kopie, record: bijgewerkt };
}

// Voegt een patch samen met de standaard-instellingen.
function mergeDefaults(current, patch) {
  const uit = { ...current };
  const p = patch || {};
  if ('enabled' in p) uit.enabled = !!p.enabled;
  if ('tafels' in p) uit.tafels = normaliseerTafels(p.tafels);
  if ('preRollMinuten' in p) uit.preRollMinuten = normaliseerPreRoll(p.preRollMinuten);
  if ('overlays' in p) uit.overlays = normaliseerOverlays(p.overlays, current.overlays);
  return uit;
}

module.exports = { TOEGESTAAN, applyPlanningPatch, updatePlanningRecord, mergeDefaults };
