const test = require('node:test');
const assert = require('node:assert');
const { buildBroadcastTitle } = require('../src/youtube/broadcasts');

// Unit-tests voor de pure titel-opbouw. Geen netwerk, dus veilig in de CI.

test('titel met sponsor volgt het template', () => {
  assert.strictEqual(
    buildBroadcastTitle({ tafel: 15, sponsor: 'GO Customs', toernooinaam: 'Amsterdam Open Qualifier 1' }),
    "Tafel 15 'GO Customs' Amsterdam Open Qualifier 1"
  );
});

test('titel zonder sponsor laat de quotes weg', () => {
  assert.strictEqual(
    buildBroadcastTitle({ tafel: 1, toernooinaam: 'Fluke ranking' }),
    'Tafel 1 Fluke ranking'
  );
});

test('spaties rond sponsor/naam worden getrimd', () => {
  assert.strictEqual(
    buildBroadcastTitle({ tafel: 3, sponsor: '  GO Customs  ', toernooinaam: '  Fluke ranking  ' }),
    "Tafel 3 'GO Customs' Fluke ranking"
  );
});

test('tafel 0 is geldig (geen verplicht-fout)', () => {
  assert.strictEqual(buildBroadcastTitle({ tafel: 0, toernooinaam: 'Test' }), 'Tafel 0 Test');
});

test('ontbrekende tafel gooit een fout', () => {
  assert.throws(() => buildBroadcastTitle({ toernooinaam: 'x' }), /tafel is verplicht/);
});
