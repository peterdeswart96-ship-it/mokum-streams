const { test } = require('node:test');
const assert = require('node:assert');
const { beoordeelCameraFrames } = require('../src/preflight');

// Een 'frame' is de base64-imageData uit GetSourceScreenshot. We vergelijken alleen
// op gelijkheid/leegte; de inhoud maakt niet uit voor de logica.
const frameA = 'data:image/jpg;base64,' + 'A'.repeat(200);
const frameB = 'data:image/jpg;base64,' + 'B'.repeat(200);

test('twee verschillende frames → live', () => {
  const r = beoordeelCameraFrames(frameA, frameB);
  assert.strictEqual(r.live, true);
});

test('twee identieke frames → bevroren (niet live)', () => {
  const r = beoordeelCameraFrames(frameA, frameA);
  assert.strictEqual(r.live, false);
  assert.match(r.reden, /bevroren/i);
});

test('ontbrekend frame (null) → geen beeld (niet live)', () => {
  assert.strictEqual(beoordeelCameraFrames(null, frameB).live, false);
  assert.strictEqual(beoordeelCameraFrames(frameA, null).live, false);
  assert.strictEqual(beoordeelCameraFrames(null, null).live, false);
  assert.match(beoordeelCameraFrames(null, null).reden, /geen beeld/i);
});

test('leeg/te-kort frame telt als geen beeld', () => {
  assert.strictEqual(beoordeelCameraFrames('', frameB).live, false);
  assert.strictEqual(beoordeelCameraFrames('kort', frameB).live, false);
});
