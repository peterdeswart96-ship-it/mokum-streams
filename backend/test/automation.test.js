const { test } = require('node:test');
const assert = require('node:assert');
const { isArmed, pauzeSchermKeys } = require('../src/config/automation');

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

test('pauzeSchermKeys: standaard alléén pauzemelding (geen jumbotron; zie #54)', () => {
  delete process.env.PAUZESCHERM_KEYS;
  assert.deepStrictEqual(pauzeSchermKeys(), ['pauzemelding']);
});

test('pauzeSchermKeys: komma-lijst wordt geparsed en getrimd', () => {
  process.env.PAUZESCHERM_KEYS = 'jumbotron, pauzemelding';
  assert.deepStrictEqual(pauzeSchermKeys(), ['jumbotron', 'pauzemelding']);
  delete process.env.PAUZESCHERM_KEYS;
});

test('pauzeSchermKeys: leeg/whitespace valt terug op de standaard', () => {
  for (const v of ['', '   ', ',', ' , ']) {
    process.env.PAUZESCHERM_KEYS = v;
    assert.deepStrictEqual(pauzeSchermKeys(), ['pauzemelding'], `verwacht default bij "${v}"`);
  }
  delete process.env.PAUZESCHERM_KEYS;
});
