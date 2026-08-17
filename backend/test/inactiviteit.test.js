const test = require('node:test');
const assert = require('node:assert');
const { tafelIsActief, inactiviteitsCheck } = require('../src/planning/inactiviteit');

const NU = new Date('2026-08-17T20:00:00Z');
const uurGeleden = (u) => new Date(NU.getTime() - u * 3600 * 1000).toISOString();

test('tafelIsActief: alleen status playing telt', () => {
  const vt = [
    { table: 1, status: 'playing' },
    { table: 3, status: 'finished' },
  ];
  assert.strictEqual(tafelIsActief(vt, 1), true);
  assert.strictEqual(tafelIsActief(vt, 3), false);
  assert.strictEqual(tafelIsActief(vt, 15), false); // niet in de lijst
});

test('tafelIsActief: hoofdletterongevoelig en veilig bij lege/ontbrekende input', () => {
  assert.strictEqual(tafelIsActief([{ table: 1, status: 'Playing' }], 1), true);
  assert.strictEqual(tafelIsActief([], 1), false);
  assert.strictEqual(tafelIsActief(null, 1), false);
  assert.strictEqual(tafelIsActief(undefined, 1), false);
});

test('inactiviteitsCheck: actieve tafel stopt nooit, ongeacht hoe lang de entry al loopt', () => {
  const entry = { tableNumber: 1, scheduledStart: uurGeleden(5) };
  const vt = [{ table: 1, status: 'playing' }];
  const r = inactiviteitsCheck(entry, vt, NU);
  assert.strictEqual(r.actief, true);
  assert.strictEqual(r.moetStoppen, false);
  assert.strictEqual(r.laatsteActiviteit, NU.toISOString());
});

test('inactiviteitsCheck: nog geen uur stil → nog niet stoppen', () => {
  const entry = { tableNumber: 1, laatsteActiviteit: uurGeleden(0.5) };
  const r = inactiviteitsCheck(entry, [], NU);
  assert.strictEqual(r.actief, false);
  assert.strictEqual(r.moetStoppen, false);
  assert.strictEqual(r.laatsteActiviteit, uurGeleden(0.5)); // ongewijzigd
});

test('inactiviteitsCheck: precies een uur stil → stoppen', () => {
  const entry = { tableNumber: 1, laatsteActiviteit: uurGeleden(1) };
  const r = inactiviteitsCheck(entry, [], NU);
  assert.strictEqual(r.moetStoppen, true);
});

test('inactiviteitsCheck: ruim over een uur stil → stoppen', () => {
  const entry = { tableNumber: 1, laatsteActiviteit: uurGeleden(3) };
  const r = inactiviteitsCheck(entry, [], NU);
  assert.strictEqual(r.moetStoppen, true);
});

test('inactiviteitsCheck: nog nooit activiteit gezien → rekent vanaf scheduledStart (#100)', () => {
  // Een stream die per ongeluk op een lege tafel is gestart: geen laatsteActiviteit ooit
  // gezet, dus de klok loopt vanaf het begin van de uitzending.
  const netGestart = { tableNumber: 1, scheduledStart: uurGeleden(0.25) };
  assert.strictEqual(inactiviteitsCheck(netGestart, [], NU).moetStoppen, false);

  const langGeleden = { tableNumber: 1, scheduledStart: uurGeleden(2) };
  assert.strictEqual(inactiviteitsCheck(langGeleden, [], NU).moetStoppen, true);
});

test('inactiviteitsCheck: geen bruikbare tijdsreferentie → nooit stoppen (veilige kant)', () => {
  const entry = { tableNumber: 1 };
  const r = inactiviteitsCheck(entry, [], NU);
  assert.strictEqual(r.moetStoppen, false);
  assert.strictEqual(r.laatsteActiviteit, null);
});

test('inactiviteitsCheck: grens is instelbaar (voor #105, korter dan het standaard uur)', () => {
  const entry = { tableNumber: 1, laatsteActiviteit: uurGeleden(0.2) };
  assert.strictEqual(inactiviteitsCheck(entry, [], NU, { grensMs: 10 * 60 * 1000 }).moetStoppen, true);
  assert.strictEqual(inactiviteitsCheck(entry, [], NU, { grensMs: 60 * 60 * 1000 }).moetStoppen, false);
});
