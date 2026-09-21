const test = require('node:test');
const assert = require('node:assert');
const { voegJackpotBadgeToe } = require('../src/video/thumbnailHtml');

// #150: de badge moet als LAATSTE kind van .canvas landen — daarbuiten knipt overflow:hidden
// 'm weg en zou de screenshot 'm missen.
const SJABLOON = '<html><body><div class="canvas">inhoud</div></body></html>';

test('voegJackpotBadgeToe: badge komt binnen .canvas te staan, met het plaatje ingebed', () => {
  const uit = voegJackpotBadgeToe(SJABLOON);
  assert.match(uit, /class="jackpotbadge"/);
  assert.match(uit, /data:image\/png;base64,/);
  // binnen .canvas: de badge staat vóór het sluitende </div>
  assert.ok(uit.indexOf('jackpotbadge') < uit.lastIndexOf('</div>'));
  assert.ok(uit.trimEnd().endsWith('</div></body></html>'));
});

test('voegJackpotBadgeToe: rechtsonder, want rechtsboven zit bij een finale het FINAL-lint', () => {
  const uit = voegJackpotBadgeToe(SJABLOON);
  assert.match(uit, /\.jackpotbadge\{[^}]*right:\d+px/);
  assert.match(uit, /\.jackpotbadge\{[^}]*bottom:\d+px/);
});

test('voegJackpotBadgeToe: onbekende sjabloonvorm → HTML ongewijzigd (liever geen badge dan kapot)', () => {
  const raar = '<html><body><p>geen canvas</p></body>';
  assert.strictEqual(voegJackpotBadgeToe(raar), raar);
});
