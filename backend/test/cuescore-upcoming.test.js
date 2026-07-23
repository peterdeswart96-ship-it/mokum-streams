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

// Regressie op het incident van 22-07-2026: Cuescore toont standaard alleen
// Active/Finished (s=2). Toernooien die nog moeten beginnen staan onder s=0.
// Haalden we alleen de standaard op, dan bleef de planning leeg.
test('getUpcomingTournaments haalt óók de Upcoming-weergave (s=0) op en voegt samen', async () => {
  const { getUpcomingTournaments } = require('../src/cuescore');
  const ACTIEF = `<h3>Wednesday, July 8, 2026</h3><a href="/tournament/bezig/22222">x</a>`;
  const UPCOMING = `<h3>Tuesday, July 14, 2026</h3><a href="/tournament/straks/33333">x</a>`;

  const opgevraagd = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    opgevraagd.push(String(url));
    if (String(url).includes('api.cuescore.com')) {
      const id = /id=(\d+)/.exec(String(url))[1];
      return { ok: true, json: async () => ({ tournamentId: Number(id), name: `T${id}` }) };
    }
    const html = String(url).includes('s=0') ? UPCOMING : ACTIEF;
    return { ok: true, text: async () => html };
  };

  try {
    const uit = await getUpcomingTournaments({ now: new Date('2026-07-08T12:00:00Z'), days: 14 });
    assert.ok(opgevraagd.some((u) => u.includes('/tournaments?s=2')), 'Active/Finished-weergave opgehaald');
    assert.ok(opgevraagd.some((u) => u.includes('/tournaments?s=0')), 'Upcoming-weergave opgehaald');
    assert.deepStrictEqual(uit.map((t) => t.id), [22222, 33333]);
  } finally {
    globalThis.fetch = echteFetch;
  }
});

test('getUpcomingTournaments werkt door als één weergave faalt', async () => {
  const { getUpcomingTournaments } = require('../src/cuescore');
  const echteFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.cuescore.com')) {
      return { ok: true, json: async () => ({ tournamentId: 33333, name: 'T33333' }) };
    }
    if (String(url).includes('s=2')) throw new Error('timeout');
    return { ok: true, text: async () => `<h3>Tuesday, July 14, 2026</h3><a href="/tournament/straks/33333">x</a>` };
  };
  try {
    const uit = await getUpcomingTournaments({ now: new Date('2026-07-08T12:00:00Z'), days: 14 });
    assert.deepStrictEqual(uit.map((t) => t.id), [33333]);
  } finally {
    globalThis.fetch = echteFetch;
  }
});
