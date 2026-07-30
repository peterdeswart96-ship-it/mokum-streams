const test = require('node:test');
const assert = require('node:assert');
const { finalizeVervolg } = require('../src/video/finalizeBeleid');

// #80 — incident 29-07-2026: finalizeVideos probeerde 423 keer op één dag dezelfde
// video af te ronden. Eerst omdat er geen starttijd was (broadcast nooit live geweest),
// daarna omdat de video verwijderd was. Elke poging kostte een YouTube-aanroep.

test('#80: een tijdelijke fout mag opnieuw geprobeerd worden', () => {
  const v = finalizeVervolg({}, 'Cuescore niet bereikbaar');
  assert.strictEqual(v.pogingen, 1);
  assert.strictEqual(v.opgegeven, false);
  assert.strictEqual(v.onherstelbaar, false);
});

test('#80: de teller loopt door over rondes heen', () => {
  const entry = { finalizePogingen: 4 };
  assert.strictEqual(finalizeVervolg(entry, 'tijdelijke storing').pogingen, 5);
});

test('#80: bij het maximum geven we op', () => {
  assert.strictEqual(finalizeVervolg({ finalizePogingen: 8 }, 'storing', { max: 10 }).opgegeven, false);
  assert.strictEqual(finalizeVervolg({ finalizePogingen: 9 }, 'storing', { max: 10 }).opgegeven, true);
});

test('#80: een verdwenen video geeft direct op, zonder te blijven proberen', () => {
  const v = finalizeVervolg({}, 'video 8tfF3vFr2jw niet gevonden');
  assert.strictEqual(v.pogingen, 1);
  assert.strictEqual(v.onherstelbaar, true);
  assert.strictEqual(v.opgegeven, true);
});

test('#80: ook de Engelse variant van "niet gevonden" telt als onherstelbaar', () => {
  assert.strictEqual(finalizeVervolg({}, 'The video was not found (404)').opgegeven, true);
});

test('#80: een ontbrekende starttijd is WEL tijdelijk — de stream kan nog beginnen', () => {
  // Deze fout kwam 65x voorbij op 29-07. Hij mag opnieuw geprobeerd worden, maar niet
  // eindeloos: na het maximum stopt 'ie alsnog.
  const bericht = 'geen streamstart (actualStartTime) voor 8tfF3vFr2jw';
  assert.strictEqual(finalizeVervolg({}, bericht).opgegeven, false);
  assert.strictEqual(finalizeVervolg({ finalizePogingen: 9 }, bericht, { max: 10 }).opgegeven, true);
});
