const test = require('node:test');
const assert = require('node:assert');
const { moetOpnieuwStarten, moetAlarmeren, MARGE_MS, HERPOGING_MS, MAX_POGINGEN } = require('../src/planning/herstart');

const NU_MS = Date.parse('2026-08-26T19:30:00Z');
const minGeleden = (m) => new Date(NU_MS - m * 60 * 1000).toISOString();

test('moetOpnieuwStarten: geplande start ligt te kort terug → nog niet ingrijpen', () => {
  const entry = { scheduledStart: minGeleden(1) };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS), false);
});

test('moetOpnieuwStarten: geplande start ligt ver genoeg terug en streamt niet → opnieuw starten', () => {
  const entry = { scheduledStart: minGeleden(3) };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS), true);
});

test('moetOpnieuwStarten: streamt al gewoon → niets doen', () => {
  const entry = { scheduledStart: minGeleden(10) };
  assert.strictEqual(moetOpnieuwStarten(entry, true, NU_MS), false);
});

test('moetOpnieuwStarten: al gestopte entry → nooit (voorkomt een spookstart)', () => {
  const entry = { scheduledStart: minGeleden(10), stopped: true };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS), false);
});

test('moetOpnieuwStarten: geen bruikbare scheduledStart → nooit (veilige kant)', () => {
  assert.strictEqual(moetOpnieuwStarten({}, false, NU_MS), false);
  assert.strictEqual(moetOpnieuwStarten({ scheduledStart: 'onzin' }, false, NU_MS), false);
  assert.strictEqual(moetOpnieuwStarten(null, false, NU_MS), false);
});

test('moetOpnieuwStarten: maximum aantal pogingen bereikt → stoppen met proberen', () => {
  const entry = { scheduledStart: minGeleden(30), startPogingen: MAX_POGINGEN };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS), false);
});

test('moetOpnieuwStarten: nog onder het maximum → wel opnieuw', () => {
  const entry = { scheduledStart: minGeleden(30), startPogingen: MAX_POGINGEN - 1 };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS), true);
});

test('moetOpnieuwStarten: recent al een nieuwe poging gedaan → wacht de tussenpoos af', () => {
  const entry = {
    scheduledStart: minGeleden(10),
    startPogingen: 1,
    laatsteStartPoging: minGeleden(1), // 1 min. geleden, ruim binnen HERPOGING_MS
  };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS), false);
});

test('moetOpnieuwStarten: tussenpoos verstreken → weer een nieuwe poging toegestaan', () => {
  const entry = {
    scheduledStart: minGeleden(10),
    startPogingen: 1,
    laatsteStartPoging: new Date(NU_MS - HERPOGING_MS - 1000).toISOString(),
  };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS), true);
});

test('moetOpnieuwStarten: marge en tussenpoos zijn instelbaar', () => {
  const entry = { scheduledStart: minGeleden(1) };
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS, { margeMs: 30 * 1000 }), true);
  assert.strictEqual(moetOpnieuwStarten(entry, false, NU_MS, { margeMs: 5 * 60 * 1000 }), false);
});

test('MARGE_MS/HERPOGING_MS zijn positieve, redelijke standaardwaarden', () => {
  assert.ok(MARGE_MS > 0);
  assert.ok(HERPOGING_MS > 0);
  assert.ok(MAX_POGINGEN > 0);
});

test('moetAlarmeren: pogingen nog niet op → nog niet alarmeren', () => {
  const entry = { scheduledStart: minGeleden(30), startPogingen: MAX_POGINGEN - 1 };
  assert.strictEqual(moetAlarmeren(entry, false, NU_MS), false);
});

test('moetAlarmeren: maximum pogingen bereikt en nog geen data → alarmeren (12-09-incident)', () => {
  const entry = { scheduledStart: minGeleden(30), startPogingen: MAX_POGINGEN };
  assert.strictEqual(moetAlarmeren(entry, false, NU_MS), true);
});

test('moetAlarmeren: streamt inmiddels gewoon → geen alarm (zelf hersteld)', () => {
  const entry = { scheduledStart: minGeleden(30), startPogingen: MAX_POGINGEN };
  assert.strictEqual(moetAlarmeren(entry, true, NU_MS), false);
});

test('moetAlarmeren: al gealarmeerd voor deze uitzending → niet nog een keer', () => {
  const entry = { scheduledStart: minGeleden(30), startPogingen: MAX_POGINGEN, alertVerstuurd: true };
  assert.strictEqual(moetAlarmeren(entry, false, NU_MS), false);
});

test('moetAlarmeren: al gestopte entry → nooit alarmeren', () => {
  const entry = { scheduledStart: minGeleden(30), startPogingen: MAX_POGINGEN, stopped: true };
  assert.strictEqual(moetAlarmeren(entry, false, NU_MS), false);
});

test('moetAlarmeren: geen bruikbare scheduledStart → nooit (veilige kant)', () => {
  assert.strictEqual(moetAlarmeren({ startPogingen: MAX_POGINGEN }, false, NU_MS), false);
  assert.strictEqual(moetAlarmeren(null, false, NU_MS), false);
});

test('moetAlarmeren: nog binnen de marge sinds de geplande start → nog niet alarmeren', () => {
  const entry = { scheduledStart: minGeleden(1), startPogingen: MAX_POGINGEN };
  assert.strictEqual(moetAlarmeren(entry, false, NU_MS), false);
});
