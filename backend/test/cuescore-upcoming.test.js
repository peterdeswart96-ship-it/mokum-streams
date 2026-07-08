const test = require('node:test');
const assert = require('node:assert');
const {
  cuescoreDateToISO,
  parseTournamentsByDate,
  upcomingTournamentIds,
} = require('../src/cuescore/parse');

const HTML = `
<h3>Monday, July 6, 2026</h3>
<a href="/tournament/verleden/11111">x</a>
<h3>Wednesday, July 8, 2026</h3>
<a href="/tournament/vandaag/22222">x</a>
<h3>Tuesday, July 14, 2026</h3>
<a href="/tournament/volgende-week/33333">x</a>
<h3>Saturday, August 1, 2026</h3>
<a href="/tournament/ver-weg/44444">x</a>`;

test('cuescoreDateToISO zet de paginadatum om naar ISO', () => {
  assert.strictEqual(cuescoreDateToISO('July 8, 2026'), '2026-07-08');
  assert.strictEqual(cuescoreDateToISO('August 1, 2026'), '2026-08-01');
  assert.strictEqual(cuescoreDateToISO('rommel'), null);
});

test('parseTournamentsByDate groepeert de ids per datum', () => {
  const g = parseTournamentsByDate(HTML);
  assert.deepStrictEqual(g.map((x) => x.datum), ['2026-07-06', '2026-07-08', '2026-07-14', '2026-08-01']);
  assert.deepStrictEqual(g[1].ids, [22222]);
});

test('upcomingTournamentIds pakt alleen toernooien in het venster [vandaag, +days]', () => {
  const now = new Date('2026-07-08T12:00:00Z'); // Amsterdam: 8 juli
  assert.deepStrictEqual(upcomingTournamentIds(HTML, now, { days: 14 }), [22222, 33333]);
});
