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
  // Scoreboard hier UIT → geen refreshSource verwacht.
  const cmds = startCommandsFor({ overlays: { sponsors: true, scoreboard: false, jumbotron: true } }, 3);
  assert.deepStrictEqual(cmds, [
    { type: 'startStream', tableNumber: 3 },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Sponsor slideshow', enabled: true },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Scoreboard', enabled: false },
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Jumbotron', enabled: true }, // expliciet aan
    { type: 'setOverlay', tableNumber: 3, sourceName: 'Pauzemelding', enabled: false }, // break-overlay: standaard uit
  ]);
});

test('startCommandsFor: scorebord AAN → ook een refreshSource voor het scorebord (verse cache bij start)', () => {
  const cmds = startCommandsFor({}, 3); // defaults: scoreboard aan
  const refresh = cmds.filter((c) => c.type === 'refreshSource');
  assert.deepStrictEqual(refresh, [{ type: 'refreshSource', tableNumber: 3, sourceName: 'Scoreboard' }]);
  assert.strictEqual(cmds[cmds.length - 1].type, 'refreshSource'); // achteraan (na de setOverlays)
});

test('startCommandsFor: scorebord UIT → géén refreshSource', () => {
  const cmds = startCommandsFor({ overlays: { scoreboard: false } }, 3);
  assert.strictEqual(cmds.some((c) => c.type === 'refreshSource'), false);
});

test('startCommandsFor: zonder opts géén preflight-vlag (handmatige start)', () => {
  const cmds = startCommandsFor({}, 1);
  assert.strictEqual(cmds[0].type, 'startStream');
  assert.strictEqual('preflight' in cmds[0], false);
});

test('startCommandsFor: opts.preflight → startStream krijgt preflight:true (auto-start)', () => {
  const cmds = startCommandsFor({}, 1, undefined, { preflight: true });
  assert.deepStrictEqual(cmds[0], { type: 'startStream', tableNumber: 1, preflight: true });
});

test('startCommandsFor: content-overlays standaard aan, break-overlays standaard uit', () => {
  const cmds = startCommandsFor({}, 1);
  const byBron = Object.fromEntries(cmds.filter((c) => c.type === 'setOverlay').map((c) => [c.sourceName, c.enabled]));
  assert.strictEqual(cmds.length, 6); // startStream + 4 overlays + scorebord-refresh (scoreboard staat aan)
  assert.strictEqual(byBron['Sponsor slideshow'], true);
  assert.strictEqual(byBron['Scoreboard'], true);
  assert.strictEqual(byBron['Jumbotron'], false);      // break-overlay
  assert.strictEqual(byBron['Pauzemelding'], false);   // break-overlay
});
