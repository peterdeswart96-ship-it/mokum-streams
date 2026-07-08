const test = require('node:test');
const assert = require('node:assert');
const {
  formatCuescoreDate,
  parseTodaysTournamentIds,
  normalizeTournament,
  findTableMatch,
  isFinalFinished,
} = require('../src/cuescore/parse');

// Fixtures gebaseerd op de echte Cuescore-datavorm (afgeleid uit notifier run.ps1).

const HTML = `
<div class="lijst">
  <h3>Monday, July 7, 2026</h3>
  <a href="/tournament/oude-toernooi/99999">Gisteren</a>
  <h3>Tuesday, July 8, 2026</h3>
  <a href="/tournament/fluke-ranking/12345">Fluke ranking</a>
  <a href="/tournament/avond-toernooi/12346">Avondtoernooi</a>
</div>`;

const RAW_TOURNAMENT = {
  tournamentId: 12345,
  name: 'Fluke ranking',
  status: 'Finished',
  matches: [
    {
      matchId: 1, matchstatus: 'playing', table: { name: '1' }, roundName: 'Quarter final',
      playerA: { playerId: 111, name: 'Speler A' }, playerB: { playerId: 222, name: 'Speler B' },
      scoreA: 3, scoreB: 2,
    },
    {
      matchId: 2, matchstatus: 'finished', table: { name: '3' }, roundName: 'final',
      playerA: { playerId: 333, name: 'Speler C' }, playerB: { playerId: 444, name: 'Speler D' },
      scoreA: 5, scoreB: 4,
    },
    {
      matchId: 3, matchstatus: 'pending', table: null, roundName: '',
      playerA: { playerId: 555, name: 'Speler E' }, playerB: { playerId: 666, name: 'Speler F' },
    },
  ],
};

test('formatCuescoreDate geeft het Cuescore-paginaformaat (en-US, Amsterdam)', () => {
  assert.strictEqual(formatCuescoreDate(new Date('2026-07-08T12:00:00Z')), 'July 8, 2026');
});

test('parseTodaysTournamentIds pakt alleen de toernooien van vandaag', () => {
  assert.deepStrictEqual(parseTodaysTournamentIds(HTML, 'July 8, 2026'), [12345, 12346]);
});

test('parseTodaysTournamentIds geeft leeg als er niets van vandaag is', () => {
  assert.deepStrictEqual(parseTodaysTournamentIds(HTML, 'July 9, 2026'), []);
});

test('normalizeTournament markeert Finished en normaliseert tafels', () => {
  const t = normalizeTournament(RAW_TOURNAMENT);
  assert.strictEqual(t.finished, true);
  assert.strictEqual(t.name, 'Fluke ranking');
  assert.strictEqual(t.matches.length, 3);
  assert.strictEqual(t.matches[0].table, '1');
  assert.strictEqual(t.matches[2].table, null);
});

test('findTableMatch vindt de lopende wedstrijd op een tafel', () => {
  const t = normalizeTournament(RAW_TOURNAMENT);
  const m = findTableMatch(t, 1, { onlyPlaying: true });
  assert.strictEqual(m.matchId, 1);
});

test('findTableMatch met onlyPlaying geeft null als de wedstrijd niet speelt', () => {
  const t = normalizeTournament(RAW_TOURNAMENT);
  assert.strictEqual(findTableMatch(t, 3, { onlyPlaying: true }), null);
});

test('findTableMatch zonder onlyPlaying geeft de afgeronde wedstrijd op tafel 3', () => {
  const t = normalizeTournament(RAW_TOURNAMENT);
  assert.strictEqual(findTableMatch(t, 3).matchId, 2);
});

test('findTableMatch geeft null voor een onbekende tafel', () => {
  const t = normalizeTournament(RAW_TOURNAMENT);
  assert.strictEqual(findTableMatch(t, 99), null);
});

test('isFinalFinished herkent een afgeronde finale', () => {
  const t = normalizeTournament(RAW_TOURNAMENT);
  assert.strictEqual(isFinalFinished(t), true);
});
