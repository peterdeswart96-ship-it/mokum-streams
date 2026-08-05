const test = require('node:test');
const assert = require('node:assert');
const { applyPlanningPatch, updatePlanningRecord, mergeDefaults } = require('../src/admin/planningStore');

const RECORD = {
  tournamentId: 1,
  name: 'Fluke ranking',
  enabled: true,
  tafels: [1, 3, 15, 16],
  overlays: { sponsors: true, scoreboard: true },
  preRollMinuten: 10,
  startOverride: null,
};

test('applyPlanningPatch wijzigt alleen toegestane velden', () => {
  const r = applyPlanningPatch(RECORD, {
    enabled: false,
    tafels: [1, 3],
    overlays: { sponsors: false },
    preRollMinuten: 15,
    startOverride: '2026-07-14T18:00:00Z',
    name: 'HACK', // niet toegestaan → genegeerd
  });
  assert.strictEqual(r.enabled, false);
  assert.deepStrictEqual(r.tafels, [1, 3]);
  // jumbotron staat er sinds 05-08 bij: elke overlay die NIET in normaliseerOverlays staat,
  // verdwijnt stil bij het opslaan — precies wat er met het jumbotron-vinkje gebeurde.
  assert.deepStrictEqual(r.overlays, { sponsors: false, scoreboard: true, jumbotron: false }); // scoreboard behouden
  assert.strictEqual(r.preRollMinuten, 15);
  assert.strictEqual(r.startOverride, '2026-07-14T18:00:00Z');
  assert.strictEqual(r.name, 'Fluke ranking'); // niet gewijzigd
});

test('applyPlanningPatch: lege startOverride wordt null', () => {
  assert.strictEqual(applyPlanningPatch(RECORD, { startOverride: '' }).startOverride, null);
  assert.strictEqual(applyPlanningPatch(RECORD, { startOverride: null }).startOverride, null);
});

test('applyPlanningPatch valideert types', () => {
  assert.throws(() => applyPlanningPatch(RECORD, { tafels: 'x' }), /tafels moet een array/);
  assert.throws(() => applyPlanningPatch(RECORD, { preRollMinuten: -1 }), /preRollMinuten/);
});

test('updatePlanningRecord werkt het juiste record bij en laat de rest staan', () => {
  const planning = [RECORD, { tournamentId: 2, enabled: true, tafels: [15] }];
  const res = updatePlanningRecord(planning, '1', { enabled: false });
  assert.strictEqual(res.record.enabled, false);
  assert.strictEqual(res.planning[1].tournamentId, 2); // andere ongemoeid
  assert.notStrictEqual(res.planning, planning); // nieuwe array (geen mutatie)
});

test('updatePlanningRecord geeft null bij onbekend id', () => {
  assert.strictEqual(updatePlanningRecord([RECORD], '999', { enabled: false }), null);
});

test('mergeDefaults werkt de standaard-instellingen bij', () => {
  const current = { enabled: true, tafels: [1, 3, 15, 16], preRollMinuten: 10, overlays: { sponsors: true, scoreboard: true } };
  const merged = mergeDefaults(current, { preRollMinuten: 5, overlays: { scoreboard: false } });
  assert.strictEqual(merged.preRollMinuten, 5);
  assert.deepStrictEqual(merged.overlays, { sponsors: true, scoreboard: false, jumbotron: false });
  assert.deepStrictEqual(merged.tafels, [1, 3, 15, 16]); // ongewijzigd
});

// Het jumbotron-vinkje in de Toernooi planner deed ogenschijnlijk niets: de waarde werd bij
// het opslaan weggegooid omdat normaliseerOverlays 'm niet kende (gemeld 05-08). Deze test
// bewaakt dat elke overlay die het dashboard kan aanvinken ook echt bewaard blijft.
test('#93: het jumbotron-vinkje blijft bewaard bij opslaan', () => {
  const r = applyPlanningPatch(
    { overlays: { sponsors: true, scoreboard: true } },
    { overlays: { sponsors: true, scoreboard: true, jumbotron: true } },
  );
  assert.strictEqual(r.overlays.jumbotron, true);

  // En weer uit kunnen zetten.
  const uit = applyPlanningPatch(r, { overlays: { ...r.overlays, jumbotron: false } });
  assert.strictEqual(uit.overlays.jumbotron, false);
});

test('#93: ontbreekt de jumbotron-sleutel, dan geldt UIT (zoals de agent hem leest)', () => {
  const r = applyPlanningPatch({ overlays: { sponsors: true, scoreboard: true } }, { overlays: { sponsors: false } });
  assert.strictEqual(r.overlays.jumbotron, false);
});
