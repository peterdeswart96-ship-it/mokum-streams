const test = require('node:test');
const assert = require('node:assert');
const { removeProcessed, enqueue, isTableBusy, startCommandsFor } = require('../src/agent/commandQueue');

test('removeProcessed haalt bevestigde commando-ids uit de wachtrij', () => {
  const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepStrictEqual(removeProcessed(q, ['a', 'c']).map((c) => c.id), ['b']);
  assert.deepStrictEqual(removeProcessed(q, []).map((c) => c.id), ['a', 'b', 'c']);
  assert.deepStrictEqual(removeProcessed([], ['x']), []);
});

test('enqueue voegt een of meerdere commandos achteraan toe', () => {
  assert.deepStrictEqual(enqueue([{ id: 'a' }], { id: 'b' }).map((c) => c.id), ['a', 'b']);
  assert.deepStrictEqual(enqueue([], [{ id: 'x' }, { id: 'y' }]).map((c) => c.id), ['x', 'y']);
});

test('isTableBusy herkent een bezette tafel in de dagstore', () => {
  const store = { '1': { videoId: 'v' } };
  assert.strictEqual(isTableBusy(store, 1), true);
  assert.strictEqual(isTableBusy(store, '1'), true);
  assert.strictEqual(isTableBusy(store, 3), false);
  assert.strictEqual(isTableBusy({}, 1), false);
});

test('isTableBusy: een gestopte entry geeft de tafel weer vrij', () => {
  const store = { '1': { videoId: 'v', stopped: true } };
  assert.strictEqual(isTableBusy(store, 1), false);
});

test('startCommandsFor levert startStream + alle overlays op de gewenste stand', () => {
  const cmds = startCommandsFor({ overlays: { sponsors: true, scoreboard: false, cuescoreLogo: false, jumbotron: true } }, 3);
  assert.deepStrictEqual(cmds, [
    { type: 'startStream', tableNumber: 3 },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Sponsor slideshow', enabled: true },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Scoreboard', enabled: false },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Scores other tables', enabled: true },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Cuescore logo', enabled: false },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Jumbotron', enabled: true }, // expliciet aan
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Pauzemelding', enabled: false }, // break-overlay: standaard uit
  ]);
});

test('startCommandsFor: content-overlays standaard aan, break-overlays standaard uit', () => {
  const cmds = startCommandsFor({}, 1);
  const byBron = Object.fromEntries(cmds.filter((c) => c.type === 'setOverlay').map((c) => [c.sourceName, c.enabled]));
  assert.strictEqual(cmds.length, 7); // startStream + 6 overlays
  assert.strictEqual(byBron['Sponsor slideshow'], true);
  assert.strictEqual(byBron['Scoreboard'], true);
  assert.strictEqual(byBron['Scores other tables'], true);
  assert.strictEqual(byBron['Cuescore logo'], true);
  assert.strictEqual(byBron['Jumbotron'], false);      // break-overlay
  assert.strictEqual(byBron['Pauzemelding'], false);   // break-overlay
});
