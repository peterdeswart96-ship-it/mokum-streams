const test = require('node:test');
const assert = require('node:assert');
const { agentBewaking, inRustigeUren, STIL_MS } = require('../src/planning/agentBewaking');

const NU_MS = Date.parse('2026-09-17T08:00:00Z');
const OVERDAG = 10 * 60; // 10:00
const NACHT = 3 * 60; // 03:00
const zwijgtSinds = (ms) => ({ lastSeen: new Date(NU_MS - ms).toISOString() });

test('agent is er → niets doen', () => {
  const r = agentBewaking(zwijgtSinds(5000), {}, NU_MS, OVERDAG);
  assert.deepStrictEqual(r, { actie: 'geen', staat: {} });
});

test('nog geen hartslag ooit → niets te bewaken', () => {
  assert.strictEqual(agentBewaking({}, {}, NU_MS, OVERDAG).actie, 'geen');
  assert.strictEqual(agentBewaking(null, null, NU_MS, OVERDAG).actie, 'geen');
});

test('kort zwijgen (herstart, hapering) blijft onder de drempel → geen alarm', () => {
  assert.strictEqual(agentBewaking(zwijgtSinds(STIL_MS - 1000), {}, NU_MS, OVERDAG).actie, 'geen');
});

test('langer dan de drempel overdag → alarm, met onthouden contactmoment', () => {
  const hb = zwijgtSinds(STIL_MS + 1000);
  const r = agentBewaking(hb, {}, NU_MS, OVERDAG);
  assert.strictEqual(r.actie, 'alarm');
  assert.strictEqual(r.staat.alarmVoorLastSeen, hb.lastSeen);
  assert.strictEqual(r.staat.alarmOm, new Date(NU_MS).toISOString());
});

test('alarm voor deze uitval al verstuurd → niet elke minuut opnieuw', () => {
  const hb = zwijgtSinds(60 * 60 * 1000);
  const staat = { alarmVoorLastSeen: hb.lastSeen, alarmOm: 'x' };
  assert.deepStrictEqual(agentBewaking(hb, staat, NU_MS, OVERDAG), { actie: 'geen', staat });
});

test('in de rustige uren wordt niet gealarmeerd', () => {
  assert.strictEqual(agentBewaking(zwijgtSinds(STIL_MS + 1000), {}, NU_MS, NACHT).actie, 'geen');
});

test('uitval uit de nacht wordt gemeld zodra de rustige uren voorbij zijn (02:16 → 07:00)', () => {
  const hb = zwijgtSinds(5 * 60 * 60 * 1000); // sinds 02:16-achtig
  assert.strictEqual(agentBewaking(hb, {}, NU_MS, 7 * 60).actie, 'alarm');
});

test('agent terug na een alarm → herstelmelding en de staat wordt leeggemaakt', () => {
  const staat = { alarmVoorLastSeen: '2026-09-17T00:16:00.000Z', alarmOm: '2026-09-17T05:00:00.000Z' };
  const r = agentBewaking(zwijgtSinds(3000), staat, NU_MS, OVERDAG);
  assert.strictEqual(r.actie, 'herstel');
  assert.deepStrictEqual(r.staat, {});
  assert.strictEqual(r.sindsLastSeen, staat.alarmVoorLastSeen);
});

test('agent terug zonder dat er een alarm was → stil', () => {
  assert.deepStrictEqual(agentBewaking(zwijgtSinds(3000), {}, NU_MS, OVERDAG), { actie: 'geen', staat: {} });
});

test('een nieuwe uitval na een herstel alarmeert weer (nieuw contactmoment)', () => {
  const hb = zwijgtSinds(STIL_MS + 1000);
  const r = agentBewaking(hb, { alarmVoorLastSeen: '2026-09-16T20:00:00.000Z' }, NU_MS, OVERDAG);
  assert.strictEqual(r.actie, 'alarm');
});

test('inRustigeUren: grenzen 01:00 (in) en 07:00 (uit)', () => {
  assert.strictEqual(inRustigeUren(59), false);
  assert.strictEqual(inRustigeUren(60), true);
  assert.strictEqual(inRustigeUren(419), true);
  assert.strictEqual(inRustigeUren(420), false);
});
