const test = require('node:test');
const assert = require('node:assert');
const { tafelSpeeltNu, volgendeToestand, pauzeCommandos, bouwLiveMatches } = require('../src/planning/pauze');

// Mini genormaliseerd toernooi (zoals normalizeTournament levert).
const toernooiMet = (matches) => ({ id: 1, name: 'T', status: 'Active', finished: false, matches });
const match = (table, status) => ({ matchId: 1, status, table: String(table), roundName: '', playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 0, scoreB: 0 });

test('tafelSpeeltNu: true bij een lopende wedstrijd op de tafel, anders false', () => {
  const ts = [toernooiMet([match(3, 'playing'), match(1, 'finished')])];
  assert.strictEqual(tafelSpeeltNu(ts, 3), true);
  assert.strictEqual(tafelSpeeltNu(ts, 1), false); // wel een match, maar finished
  assert.strictEqual(tafelSpeeltNu(ts, 15), false); // geen match
  assert.strictEqual(tafelSpeeltNu([], 3), false);
});

test('volgendeToestand: wedstrijd speelt → direct spelen (geen debounce)', () => {
  // vanuit pauze weer spelen zodra er een match is
  const r = volgendeToestand({ toestand: 'pauze', sinds: 0, wachtSinds: null }, true, 40000, 20000);
  assert.strictEqual(r.toestand, 'spelen');
  assert.strictEqual(r.veranderd, true);
});

test('volgendeToestand: match eindigt → pas naar pauze na debounce', () => {
  // t=1000: match net weg, prev=spelen → nog spelen, wachttimer start
  const a = volgendeToestand({ toestand: 'spelen', sinds: 0, wachtSinds: null }, false, 1000, 20000);
  assert.strictEqual(a.toestand, 'spelen');
  assert.strictEqual(a.veranderd, false);
  assert.strictEqual(a.wachtSinds, 1000);

  // t=25000: 24s geen match >= 20s debounce → pauze
  const b = volgendeToestand(a, false, 25000, 20000);
  assert.strictEqual(b.toestand, 'pauze');
  assert.strictEqual(b.veranderd, true);
});

test('volgendeToestand: blijft pauze zolang er geen wedstrijd is (geen dubbele omschakeling)', () => {
  const r = volgendeToestand({ toestand: 'pauze', sinds: 25000, wachtSinds: null }, false, 60000, 20000);
  assert.strictEqual(r.toestand, 'pauze');
  assert.strictEqual(r.veranderd, false);
});

test('volgendeToestand: eerste run zonder vorige → start neutraal in spelen', () => {
  const r = volgendeToestand(null, true, 5000, 20000);
  assert.strictEqual(r.toestand, 'spelen');
  assert.strictEqual(r.veranderd, false);
});

test('bouwLiveMatches: per tafel de lopende wedstrijd (of laatste), anders null', () => {
  const ts = [toernooiMet([
    { matchId: 1, status: 'playing', table: '3', roundName: 'R1', playerA: { name: 'A' }, playerB: { name: 'B' }, scoreA: 4, scoreB: 1 },
    { matchId: 2, status: 'finished', table: '1', roundName: 'Finale', playerA: { name: 'C' }, playerB: { name: 'D' }, scoreA: 7, scoreB: 5 },
  ])];
  const r = bouwLiveMatches(ts, [1, 3, 15]);
  assert.deepStrictEqual(r['3'], { playerA: 'A', playerB: 'B', scoreA: 4, scoreB: 1, status: 'playing', round: 'R1' });
  assert.deepStrictEqual(r['1'], { playerA: 'C', playerB: 'D', scoreA: 7, scoreB: 5, status: 'finished', round: 'Finale' });
  assert.strictEqual(r['15'], null); // geen wedstrijd op tafel 15
});

test('pauzeCommandos: schakelt de pauze-overlays op de gewenste stand, onbekende sleutels overslaan', () => {
  const bron = { jumbotron: 'Jumbotron', pauzemelding: 'Pauzemelding', sponsors: 'Sponsor slideshow' };
  const aan = pauzeCommandos(3, true, bron, ['jumbotron', 'pauzemelding', 'bestaatniet']);
  assert.deepStrictEqual(aan, [
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Jumbotron', enabled: true },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Pauzemelding', enabled: true },
  ]);
  const uit = pauzeCommandos(3, false, bron, ['jumbotron', 'pauzemelding']);
  assert.ok(uit.every((c) => c.enabled === false));
});
