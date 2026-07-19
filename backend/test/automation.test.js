const { test } = require('node:test');
const assert = require('node:assert');
const { isArmed, pauzeSchermKeys, pauzeSchermUitKeys } = require('../src/config/automation');

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

test('pauzeSchermUitKeys: standaard leeg (geen inverse toggling)', () => {
  delete process.env.PAUZESCHERM_UIT;
  assert.deepStrictEqual(pauzeSchermUitKeys(), []);
  process.env.PAUZESCHERM_UIT = '  ,  ';
  assert.deepStrictEqual(pauzeSchermUitKeys(), []);
  delete process.env.PAUZESCHERM_UIT;
});

test('pauzeSchermUitKeys: komma-lijst geparsed (bijv. scoreboard)', () => {
  process.env.PAUZESCHERM_UIT = 'scoreboard';
  assert.deepStrictEqual(pauzeSchermUitKeys(), ['scoreboard']);
  process.env.PAUZESCHERM_UIT = 'scoreboard, sponsors';
  assert.deepStrictEqual(pauzeSchermUitKeys(), ['scoreboard', 'sponsors']);
  delete process.env.PAUZESCHERM_UIT;
});

test('pauzeSchermRefreshKeys: standaard leeg; komma-lijst geparsed', () => {
  const { pauzeSchermRefreshKeys } = require('../src/config/automation');
  delete process.env.PAUZESCHERM_REFRESH;
  assert.deepStrictEqual(pauzeSchermRefreshKeys(), []);
  process.env.PAUZESCHERM_REFRESH = 'scoreboard';
  assert.deepStrictEqual(pauzeSchermRefreshKeys(), ['scoreboard']);
  delete process.env.PAUZESCHERM_REFRESH;
});
