const test = require('node:test');
const assert = require('node:assert');
const { voegJackpotBadgeToe, spelersHtml } = require('../src/video/thumbnailHtml');

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

test('voegJackpotBadgeToe: linksonder bij de datumpil — niet rechtsboven (FINAL-lint) en niet in de rechterhoek (YouTube-duurchip)', () => {
  const uit = voegJackpotBadgeToe(SJABLOON);
  assert.match(uit, /\.jackpotbadge\{[^}]*left:\d+px/);
  assert.match(uit, /\.jackpotbadge\{[^}]*bottom:\d+px/);
  // De exacte plek wordt tijdens het renderen gemeten; dit is de terugval in de CSS.
  assert.doesNotMatch(uit, /\.jackpotbadge\{[^}]*right:\d+px/);
});

test('voegJackpotBadgeToe: onbekende sjabloonvorm → HTML ongewijzigd (liever geen badge dan kapot)', () => {
  const raar = '<html><body><p>geen canvas</p></body>';
  assert.strictEqual(voegJackpotBadgeToe(raar), raar);
});

// Challenge-thumbnail: "A VS B" wordt drie regels met VS apart (rood via de template).
test('spelersHtml: "A VS B" wordt naam / VS / naam op drie regels', () => {
  assert.strictEqual(spelersHtml('Gurps VS Dylan'),
    '<span class="sp">Gurps</span><span class="sp vs">VS</span><span class="sp">Dylan</span>');
  assert.match(spelersHtml('Koen Hoevenaars vs Joris de Winkel'), /Koen Hoevenaars<\/span><span class="sp vs">VS<\/span><span class="sp">Joris de Winkel/);
});

test('spelersHtml: vrije tekst zonder VS blijft één regel gewone tekst', () => {
  assert.strictEqual(spelersHtml('9 Ball Bank Challenge'), '9 Ball Bank Challenge');
  assert.strictEqual(spelersHtml(''), '');
  assert.strictEqual(spelersHtml(null), '');
});

test('spelersHtml: onvolledig paar of meerdere VS → gewone tekst (geen half resultaat)', () => {
  assert.strictEqual(spelersHtml('? VS '), '? VS ');
  assert.ok(!spelersHtml('A VS B VS C').includes('class="sp"'));
});

test('spelersHtml: namen worden geëscaped', () => {
  const h = spelersHtml('<b>A</b> VS B&C');
  assert.ok(h.includes('&lt;b&gt;A&lt;/b&gt;') && h.includes('B&amp;C') && !h.includes('<b>'));
});
