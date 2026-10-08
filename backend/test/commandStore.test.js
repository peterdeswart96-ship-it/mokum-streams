const test = require('node:test');
const assert = require('node:assert/strict');

// updateJson vervangen door een geheugenversie: dezelfde vorm (pad, updater, fallback), zonder blob-opslag.
let opslag = null;
require.cache[require.resolve('../src/storage/blob')] = {
  id: 'blob', filename: 'blob', loaded: true,
  exports: { updateJson: async (_pad, updater, fallback) => { opslag = updater(opslag == null ? fallback : opslag); return opslag; } },
};
const { voegCommandosToe, verwijderVerwerkt } = require('../src/agent/commandStore');

test('voegCommandosToe: zet achteraan, ook bij een lege of kapotte wachtrij', async () => {
  opslag = null;
  await voegCommandosToe([{ id: 'a' }]);
  await voegCommandosToe({ id: 'b' });
  assert.deepEqual(opslag.map((c) => c.id), ['a', 'b']);
  opslag = 'rommel';
  await voegCommandosToe([{ id: 'c' }]);
  assert.deepEqual(opslag.map((c) => c.id), ['c']);
});

test('verwijderVerwerkt: haalt alleen bevestigde commando\'s weg en laat nieuwe staan', async () => {
  opslag = [{ id: 'a' }, { id: 'b' }, { id: 'nieuw' }];
  const rest = await verwijderVerwerkt(['a', 'b', 'onbekend']);
  assert.deepEqual(rest.map((c) => c.id), ['nieuw']);
});
