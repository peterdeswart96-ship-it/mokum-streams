const test = require('node:test');
const assert = require('node:assert');
const { stopAfstemming, GRATIE_MS, HERPOGING_MS, MAX_STOP_POGINGEN } = require('../src/planning/stopAfstemming');

const NU_MS = Date.parse('2026-08-24T00:30:00Z');
const geleden = (ms) => new Date(NU_MS - ms).toISOString();
const ZENDT = { tableNumber: 1, streaming: true, obsConnected: true };
const STIL = { tableNumber: 1, streaming: false, obsConnected: true };

test('niet gestopt geregistreerd → niets doen (dat is de taak van checkStops zelf)', () => {
  assert.deepStrictEqual(stopAfstemming({ stopped: false }, ZENDT, NU_MS), { actie: 'geen', patch: {} });
  assert.strictEqual(stopAfstemming(null, ZENDT, NU_MS).actie, 'geen');
});

test('gestopt en de agent meldt ook niet-zendend → alles klopt', () => {
  assert.deepStrictEqual(stopAfstemming({ stopped: true }, STIL, NU_MS), { actie: 'geen', patch: {} });
});

test('geen status van de agent voor deze tafel → geen bewijs, dus niets doen', () => {
  assert.strictEqual(stopAfstemming({ stopped: true }, undefined, NU_MS).actie, 'geen');
});

test('afwijking verdwenen → gestempeld moment wordt opgeruimd', () => {
  const r = stopAfstemming({ stopped: true, stopAfwijkingSinds: geleden(60000) }, STIL, NU_MS);
  assert.deepStrictEqual(r, { actie: 'geen', patch: { stopAfwijkingSinds: null } });
});

test('gestopt maar zendt nog, eerste keer gezien → stempelen en wachten', () => {
  const r = stopAfstemming({ stopped: true }, ZENDT, NU_MS);
  assert.strictEqual(r.actie, 'wacht');
  assert.strictEqual(r.patch.stopAfwijkingSinds, new Date(NU_MS).toISOString());
});

test('binnen de gratietijd → wachten, OBS is nog bezig met de stop', () => {
  const entry = { stopped: true, stopAfwijkingSinds: geleden(GRATIE_MS - 1000) };
  assert.deepStrictEqual(stopAfstemming(entry, ZENDT, NU_MS), { actie: 'wacht', patch: {} });
});

test('gratietijd voorbij en zendt nog → opnieuw stoppen, poging telt mee', () => {
  const entry = { stopped: true, stopAfwijkingSinds: geleden(GRATIE_MS + 1000) };
  const r = stopAfstemming(entry, ZENDT, NU_MS);
  assert.strictEqual(r.actie, 'herstop');
  assert.strictEqual(r.patch.stopPogingen, 1);
  assert.strictEqual(r.patch.laatsteStopPoging, new Date(NU_MS).toISOString());
});

test('recent al opnieuw gestopt → tussenpoos afwachten', () => {
  const entry = {
    stopped: true, stopAfwijkingSinds: geleden(10 * 60000), stopPogingen: 1,
    laatsteStopPoging: geleden(HERPOGING_MS - 1000),
  };
  assert.strictEqual(stopAfstemming(entry, ZENDT, NU_MS).actie, 'wacht');
});

test('tussenpoos voorbij → volgende poging', () => {
  const entry = {
    stopped: true, stopAfwijkingSinds: geleden(10 * 60000), stopPogingen: 1,
    laatsteStopPoging: geleden(HERPOGING_MS + 1000),
  };
  const r = stopAfstemming(entry, ZENDT, NU_MS);
  assert.strictEqual(r.actie, 'herstop');
  assert.strictEqual(r.patch.stopPogingen, 2);
});

test('alle pogingen op en het zendt nog → één keer alarm (tafel 15, 23-08)', () => {
  const entry = {
    stopped: true, stopAfwijkingSinds: geleden(30 * 60000), stopPogingen: MAX_STOP_POGINGEN,
    laatsteStopPoging: geleden(HERPOGING_MS + 1000),
  };
  assert.deepStrictEqual(stopAfstemming(entry, ZENDT, NU_MS), { actie: 'alarm', patch: { stopAlertVerstuurd: true } });
});

test('alarm al verstuurd → niet elke minuut opnieuw', () => {
  const entry = {
    stopped: true, stopAfwijkingSinds: geleden(30 * 60000), stopPogingen: MAX_STOP_POGINGEN,
    stopAlertVerstuurd: true,
  };
  assert.deepStrictEqual(stopAfstemming(entry, ZENDT, NU_MS), { actie: 'geen', patch: {} });
});
