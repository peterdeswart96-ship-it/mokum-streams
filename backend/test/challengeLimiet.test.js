const test = require('node:test');
const assert = require('node:assert');
const { challengeMoetStoppen } = require('../src/planning/challengeLimiet');

const NU = new Date('2026-08-18T20:00:00Z');
const uurGeleden = (u) => new Date(NU.getTime() - u * 3600 * 1000).toISOString();

test('challengeMoetStoppen: precies 2 uur bereikt → stoppen', () => {
  const entry = { streamType: 'challenge', scheduledStart: uurGeleden(2) };
  assert.strictEqual(challengeMoetStoppen(entry, NU), true);
});

test('challengeMoetStoppen: ruim over 2 uur → stoppen', () => {
  const entry = { streamType: 'challenge', scheduledStart: uurGeleden(3.5) };
  assert.strictEqual(challengeMoetStoppen(entry, NU), true);
});

test('challengeMoetStoppen: nog geen 2 uur → nog niet stoppen', () => {
  const entry = { streamType: 'challenge', scheduledStart: uurGeleden(1.9) };
  assert.strictEqual(challengeMoetStoppen(entry, NU), false);
});

test('challengeMoetStoppen: geen challenge (toernooi/league/custom) → nooit door deze regel stoppen', () => {
  const entry = { streamType: 'tournament', scheduledStart: uurGeleden(5) };
  assert.strictEqual(challengeMoetStoppen(entry, NU), false);
  assert.strictEqual(challengeMoetStoppen({ scheduledStart: uurGeleden(5) }, NU), false); // geen streamType
});

test('challengeMoetStoppen: al gestopte entry → nooit (voorkomt dubbel werk)', () => {
  const entry = { streamType: 'challenge', scheduledStart: uurGeleden(5), stopped: true };
  assert.strictEqual(challengeMoetStoppen(entry, NU), false);
});

test('challengeMoetStoppen: geen bruikbare scheduledStart → nooit stoppen (veilige kant)', () => {
  assert.strictEqual(challengeMoetStoppen({ streamType: 'challenge' }, NU), false);
  assert.strictEqual(challengeMoetStoppen({ streamType: 'challenge', scheduledStart: 'onzin' }, NU), false);
  assert.strictEqual(challengeMoetStoppen(null, NU), false);
});

test('challengeMoetStoppen: limiet is instelbaar', () => {
  const entry = { streamType: 'challenge', scheduledStart: uurGeleden(1) };
  assert.strictEqual(challengeMoetStoppen(entry, NU, { limietMs: 30 * 60 * 1000 }), true);
  assert.strictEqual(challengeMoetStoppen(entry, NU, { limietMs: 3 * 3600 * 1000 }), false);
});

test('challengeMoetStoppen: negeert of er nog gespeeld wordt — dat is precies het punt', () => {
  // Deze functie kijkt bewust NIET naar wedstrijdstatus (in tegenstelling tot stopReden()
  // in planning/stop.js) — de hele bedoeling is dat een nog lopende partij na 2 uur toch
  // stopt, zodat de spelers zelf om een nieuwe stream vragen.
  const entry = { streamType: 'challenge', scheduledStart: uurGeleden(2.5) };
  assert.strictEqual(challengeMoetStoppen(entry, NU), true);
});
