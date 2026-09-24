const test = require('node:test');
const assert = require('node:assert');
const { statusOmslagen, omslagRegel } = require('../src/agent/statusOmslag');
const { analyseer } = require('../src/rapport/duiding');

// Tests voor de statusomslag-logging (#116). Alleen een OMSLAG in wat de agent meldt wordt
// gelogd, geen regel per statuspost.

const tafel = (n, streaming, extra = {}) => ({ tableNumber: n, obsConnected: true, streaming, bitrateKbps: streaming ? 16033 : 0, ...extra });

test('#116: van niet-zendend naar zendend geeft één omslag met de bitrate', () => {
  const o = statusOmslagen([tafel(1, false)], [tafel(1, true)]);
  assert.deepStrictEqual(o, [{ tafel: 1, naar: 'zendt', bitrateKbps: 16033 }]);
});

test('#116: van zendend naar gestopt geeft één omslag', () => {
  const o = statusOmslagen([tafel(3, true)], [tafel(3, false)]);
  assert.deepStrictEqual(o, [{ tafel: 3, naar: 'gestopt', bitrateKbps: null }]);
});

test('#116: een ongewijzigde stand geeft geen omslag (anders duizenden logregels per avond)', () => {
  assert.deepStrictEqual(statusOmslagen([tafel(1, true), tafel(3, false)], [tafel(1, true), tafel(3, false)]), []);
});

test('#116: alleen de tafel die omsloeg komt terug, in tafelvolgorde', () => {
  const o = statusOmslagen(
    [tafel(16, false), tafel(1, false), tafel(3, true)],
    [tafel(16, true), tafel(1, false), tafel(3, false)],
  );
  assert.deepStrictEqual(o.map((x) => [x.tafel, x.naar]), [[3, 'gestopt'], [16, 'zendt']]);
});

test('#116: geen OBS-verbinding is geen stop — de agent weet dan niet of er gezonden wordt', () => {
  // Verbinding kwijt: streaming staat dan op false, maar dat is onbekend en geen gestopte stream.
  assert.deepStrictEqual(statusOmslagen([tafel(1, true)], [tafel(1, false, { obsConnected: false })]), []);
  // En bij herstel van de verbinding: de vorige meting telde niet, dus ook geen 'zendt'-omslag.
  assert.deepStrictEqual(statusOmslagen([tafel(1, false, { obsConnected: false })], [tafel(1, true)]), []);
});

test('#116: zonder vorige status (eerste post, of onleesbaar) wordt niets gelogd', () => {
  assert.deepStrictEqual(statusOmslagen(null, [tafel(1, true)]), []);
  assert.deepStrictEqual(statusOmslagen(undefined, [tafel(1, true)]), []);
  assert.deepStrictEqual(statusOmslagen([], [tafel(1, true)]), []); // tafel was er nog niet
});

test('#116: rommel in de status laat de logging niet omvallen', () => {
  assert.deepStrictEqual(statusOmslagen([tafel(1, false)], null), []);
  assert.deepStrictEqual(statusOmslagen([null, {}], [null, { tableNumber: 1 }, tafel(1, true)]), []);
});

test('#116: het logregelformaat is vast — het rapport leest het later terug', () => {
  assert.strictEqual(omslagRegel({ tafel: 1, naar: 'zendt', bitrateKbps: 16033 }), '[agent] tafel 1: OBS meldt: zendt (16033 kbps)');
  assert.strictEqual(omslagRegel({ tafel: 15, naar: 'gestopt', bitrateKbps: null }), '[agent] tafel 15: OBS meldt: gestopt');
});

test('#116: het ochtendrapport negeert de nieuwe regels voorlopig (eerst een paar avonden meekijken)', () => {
  const T = (u, m) => new Date(`2026-09-25T${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const a = analyseer([
    { tijd: T(17, 30), bericht: '[agent] tafel 1: OBS meldt: zendt (16033 kbps)' },
    { tijd: T(21, 10), bericht: '[agent] tafel 1: OBS meldt: gestopt' },
  ]);
  assert.strictEqual(a.gebeurtenissen.length, 0);
  assert.deepStrictEqual(a.bevindingen.map((b) => b.soort), ['goed']);
  assert.strictEqual(a.cijfers.problemen, 0);
});
