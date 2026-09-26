const test = require('node:test');
const assert = require('node:assert');
const { moetLiveControleren, beoordeelLive, MARGE_MS, MAX_LEEFTIJD_MS } = require('../src/planning/liveBevestiging');

const NU_MS = Date.parse('2026-09-16T20:00:00Z');
const geleden = (ms) => new Date(NU_MS - ms).toISOString();
const MIN = 60 * 1000;
const basis = () => ({ videoId: 'ET0Axv8OIkI', scheduledStart: geleden(MARGE_MS + MIN), stopped: false });

test('agent zendt, geplande start ruim voorbij, nog niet bevestigd → controleren', () => {
  assert.strictEqual(moetLiveControleren(basis(), true, NU_MS), true);
});

test('binnen de marge → nog niet controleren (het herstart-vangnet #114 krijgt eerst de tijd)', () => {
  const e = { ...basis(), scheduledStart: geleden(MARGE_MS - MIN) };
  assert.strictEqual(moetLiveControleren(e, true, NU_MS), false);
});

test('agent meldt geen zenden → niet aan ons (dat is #114)', () => {
  assert.strictEqual(moetLiveControleren(basis(), false, NU_MS), false);
  assert.strictEqual(moetLiveControleren(basis(), undefined, NU_MS), false);
});

test('al bevestigd of al gealarmeerd → niet opnieuw controleren', () => {
  assert.strictEqual(moetLiveControleren({ ...basis(), ytLiveBevestigd: true }, true, NU_MS), false);
  assert.strictEqual(moetLiveControleren({ ...basis(), ytAlertVerstuurd: true }, true, NU_MS), false);
});

test('gestopt, gefinaliseerd of zonder videoId → overslaan', () => {
  assert.strictEqual(moetLiveControleren({ ...basis(), stopped: true }, true, NU_MS), false);
  assert.strictEqual(moetLiveControleren({ ...basis(), finalized: true }, true, NU_MS), false);
  assert.strictEqual(moetLiveControleren({ ...basis(), videoId: undefined }, true, NU_MS), false);
  assert.strictEqual(moetLiveControleren(null, true, NU_MS), false);
});

test('onleesbare of te oude geplande start → overslaan', () => {
  assert.strictEqual(moetLiveControleren({ ...basis(), scheduledStart: 'onzin' }, true, NU_MS), false);
  assert.strictEqual(moetLiveControleren({ ...basis(), scheduledStart: undefined }, true, NU_MS), false);
  const oud = { ...basis(), scheduledStart: geleden(MAX_LEEFTIJD_MS + MIN) };
  assert.strictEqual(moetLiveControleren(oud, true, NU_MS), false);
});

test('YouTube meldt een echte start → bevestigd, geen alarm', () => {
  const r = beoordeelLive(basis(), { actualStartTime: '2026-09-16T19:20:00Z' });
  assert.deepStrictEqual(r, { actie: 'live', patch: { ytLiveBevestigd: true } });
});

test('geen actualStartTime terwijl de agent zendt → alarm (het 16-09-scenario)', () => {
  const r = beoordeelLive(basis(), { actualStartTime: null, scheduledStartTime: '2026-09-16T19:15:00Z' });
  assert.deepStrictEqual(r, { actie: 'alarm', patch: { ytAlertVerstuurd: true } });
});

test('video niet gevonden → niets doen, geen vals alarm', () => {
  assert.deepStrictEqual(beoordeelLive(basis(), null), { actie: 'geen', patch: {} });
});
