const test = require('node:test');
const assert = require('node:assert');
const { opruimActies } = require('../src/youtube/opruimen');

// #78 — incident 28-07-2026. Aan de stream key van tafel 1 hing nog een broadcast van
// de vorige avond. YouTube koppelde het camerabeeld aan die oude video; de nieuwe bleef
// op 'Upcoming' staan. Kijkers op de juiste link zagen niets.

const KEY1 = 'stream-tafel-1';
const KEY3 = 'stream-tafel-3';

test('#78: een oude LIVE broadcast op dezelfde key wordt afgesloten, niet weggegooid', () => {
  const acties = opruimActies([
    { videoId: 'oud', title: 'Tafel 1 Final', status: 'live', boundStreamId: KEY1 },
  ], KEY1);
  assert.deepStrictEqual(acties.map((a) => [a.videoId, a.actie]), [['oud', 'afsluiten']]);
});

test('#78: een broadcast die nooit live is geweest wordt verwijderd', () => {
  // created/ready/testing bevatten geen opname; afsluiten kan bij YouTube ook niet.
  for (const status of ['created', 'ready', 'testing']) {
    const acties = opruimActies([{ videoId: 'x', title: 'Upcoming', status, boundStreamId: KEY1 }], KEY1);
    assert.deepStrictEqual(acties.map((a) => a.actie), ['verwijderen'], `status ${status}`);
  }
});

test('#78: broadcasts van een ANDERE tafel blijven met rust', () => {
  const acties = opruimActies([
    { videoId: 'tafel3', title: 'Tafel 3', status: 'live', boundStreamId: KEY3 },
  ], KEY1);
  assert.deepStrictEqual(acties, []);
});

test('#78: al afgeronde broadcasts blokkeren niets en worden overgeslagen', () => {
  const acties = opruimActies([
    { videoId: 'a', title: 'klaar', status: 'complete', boundStreamId: KEY1 },
    { videoId: 'b', title: 'ingetrokken', status: 'revoked', boundStreamId: KEY1 },
  ], KEY1);
  assert.deepStrictEqual(acties, []);
});

test('#78: de broadcast die we willen houden blijft staan', () => {
  const acties = opruimActies([
    { videoId: 'nieuw', title: 'van ons', status: 'ready', boundStreamId: KEY1 },
    { videoId: 'oud', title: 'restje', status: 'ready', boundStreamId: KEY1 },
  ], KEY1, 'nieuw');
  assert.deepStrictEqual(acties.map((a) => a.videoId), ['oud']);
});

test('#78: zonder stream key raken we niets aan', () => {
  const acties = opruimActies([{ videoId: 'x', status: 'live', boundStreamId: KEY1 }], null);
  assert.deepStrictEqual(acties, []);
});

test('#78: het volledige beeld van 28-07 levert precies de goede twee acties op', () => {
  const acties = opruimActies([
    { videoId: 'w2yAj9ohYDY', title: 'Tafel 1 Final', status: 'live', boundStreamId: KEY1 },      // hangt er nog live in
    { videoId: 'tIimJ2HIlEc', title: 'Tafel 1 Fluke ranking', status: 'ready', boundStreamId: KEY1 }, // wachtte op zijn beurt
    { videoId: 'Gpz53YKMnZM', title: 'Tafel 3 Fluke ranking', status: 'live', boundStreamId: KEY3 },  // andere tafel, met rust laten
  ], KEY1);
  assert.deepStrictEqual(acties.map((a) => [a.videoId, a.actie]), [
    ['w2yAj9ohYDY', 'afsluiten'],
    ['tIimJ2HIlEc', 'verwijderen'],
  ]);
});
