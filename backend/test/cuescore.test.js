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

// --- #77: Cuescore levert tijden in twee formaten ---
//
// Dezelfde endpoint geeft afhankelijk van de client "2026-07-28T17:30:00Z" of
// "07/28/2026 17:30:00". Naast elkaar geverifieerd op toernooi 75880993: identieke
// kloktijden, en de ISO-vorm zegt expliciet Z. De kale vorm is dus UTC — maar
// `new Date()` leest die als lokale tijd van de machine, en dan loopt een laptop in
// Nederland twee uur uit de pas met productie.

test('#77: het kale Cuescore-formaat wordt als UTC gelezen, niet als lokale tijd', () => {
  const { tijdNaarISO } = require('../src/cuescore/parse');
  assert.strictEqual(tijdNaarISO('07/28/2026 17:30:00'), '2026-07-28T17:30:00.000Z');
  assert.strictEqual(tijdNaarISO('7/8/2026 5:03'), '2026-07-08T05:03:00.000Z');
});

test('#77: een tijd die al een zone heeft blijft ongewijzigd', () => {
  // Ondubbelzinnig, dus niets aan doen: herschrijven zou alleen opgeslagen waarden
  // laten verschuiven (milliseconden erbij) zonder iets op te lossen.
  const { tijdNaarISO } = require('../src/cuescore/parse');
  assert.strictEqual(tijdNaarISO('2026-07-28T17:30:00Z'), '2026-07-28T17:30:00Z');
  assert.strictEqual(tijdNaarISO('2026-07-28T19:30:00+02:00'), '2026-07-28T19:30:00+02:00');
  // ...en beide beschrijven wel hetzelfde moment.
  assert.strictEqual(Date.parse(tijdNaarISO('2026-07-28T19:30:00+02:00')), Date.parse('2026-07-28T17:30:00Z'));
});

test('#77: een ISO-tijd zonder zone geldt ook als UTC', () => {
  const { tijdNaarISO } = require('../src/cuescore/parse');
  assert.strictEqual(tijdNaarISO('2026-07-28T17:30:00'), '2026-07-28T17:30:00.000Z');
});

test('#77: lege en onzinnige waarden geven null', () => {
  const { tijdNaarISO } = require('../src/cuescore/parse');
  for (const w of [null, undefined, '', '   ', 'geen datum']) {
    assert.strictEqual(tijdNaarISO(w), null, JSON.stringify(w));
  }
});

test('#77: beide formaten leveren via normalizeMatch hetzelfde moment op', () => {
  const { normalizeMatch } = require('../src/cuescore/parse');
  const a = normalizeMatch({ matchId: 1, starttime: '07/28/2026 17:30:00', stoptime: '07/28/2026 18:00:00' });
  const b = normalizeMatch({ matchId: 1, starttime: '2026-07-28T17:30:00Z', stoptime: '2026-07-28T18:00:00Z' });
  assert.strictEqual(Date.parse(a.start), Date.parse(b.start));
  assert.strictEqual(Date.parse(a.stop), Date.parse(b.stop));
  // En dat moment is 17:30 UTC — niet 17:30 in de tijdzone van deze machine.
  assert.strictEqual(Date.parse(a.start), Date.UTC(2026, 6, 28, 17, 30, 0));
});

// --- #86: doorlopende toernooien staan alleen op de organisatiepagina ---
//
// "Mokum 14.1 Summer league" (16 juni t/m 31 augustus) staat niet op /tournaments en
// valt buiten het venster van veertien dagen. Cuescore markeert 'm op de
// organisatiepagina zelf met class="date live". Fragment uit de echte pagina:

const ORG_FRAGMENT = `
  <td style="padding: 8px 4px;">
    <div class="date upcoming"> August 3, 2026</div>
    <div class="name"><a class="bold" href="//cuescore.com/tournament/Mokum+MEGA+Summer+Ranking/75881200">MEGA</a></div>
  </td>
  <td style="padding: 8px 4px;">
    <div class="date live"> June 16 - August 31, 2026</div>
    <div class="name"><a class="bold" href="//cuescore.com/tournament/Mokum+14.1+Summer+league/83049058">Mokum 14.1 Summer league</a></div>
  </td>
  <td style="padding: 8px 4px;">
    <div class="date"> July 4, 2026</div>
    <div class="name"><a class="bold" href="//cuescore.com/tournament/Oud/70000001">Oud</a></div>
  </td>`;

test('#86: alleen toernooien met class="date live" tellen als lopend', () => {
  const { lopendeTournamentIds } = require('../src/cuescore/parse');
  assert.deepStrictEqual(lopendeTournamentIds(ORG_FRAGMENT), [83049058]);
});

test('#86: geen markering op de pagina → lege lijst, geen fout', () => {
  const { lopendeTournamentIds } = require('../src/cuescore/parse');
  assert.deepStrictEqual(lopendeTournamentIds('<html>niets bijzonders</html>'), []);
  assert.deepStrictEqual(lopendeTournamentIds(''), []);
  assert.deepStrictEqual(lopendeTournamentIds(null), []);
});

test('#86: twee lopende toernooien leveren beide ids op, zonder dubbelen', () => {
  const { lopendeTournamentIds } = require('../src/cuescore/parse');
  const html = ORG_FRAGMENT + `
    <div class="date live"> July 1 - September 1, 2026</div>
    <div class="name"><a href="//cuescore.com/tournament/Tweede+League/99999">Tweede</a></div>
    <div class="date live"> June 16 - August 31, 2026</div>
    <div class="name"><a href="//cuescore.com/tournament/Mokum+14.1+Summer+league/83049058">Zelfde</a></div>`;
  assert.deepStrictEqual(lopendeTournamentIds(html), [83049058, 99999]);
});
