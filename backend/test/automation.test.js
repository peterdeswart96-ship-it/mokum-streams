const { test } = require('node:test');
const assert = require('node:assert');
const { isArmed } = require('../src/config/automation');

test('isArmed: standaard UIT als AUTOMATION_ARMED niet gezet is', () => {
  delete process.env.AUTOMATION_ARMED;
  assert.strictEqual(isArmed(), false);
});

test('isArmed: AAN bij "true" (case-insensitive)', () => {
  process.env.AUTOMATION_ARMED = 'true';
  assert.strictEqual(isArmed(), true);
  process.env.AUTOMATION_ARMED = 'TRUE';
  assert.strictEqual(isArmed(), true);
  delete process.env.AUTOMATION_ARMED;
});

test('isArmed: UIT bij andere waarden (yes/1/leeg)', () => {
  for (const v of ['yes', '1', '', 'on']) {
    process.env.AUTOMATION_ARMED = v;
    assert.strictEqual(isArmed(), false, `verwacht false bij "${v}"`);
  }
  delete process.env.AUTOMATION_ARMED;
});
