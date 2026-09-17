const test = require('node:test');
const assert = require('node:assert');
const { finaliseerActie } = require('../src/video/finalizeKeuze');

const basis = { stopped: true, videoId: 'abc123' };

test('#102: gekoppeld toernooi → toernooi, ook als er (per ongeluk) spelersvelden op staan', () => {
  const e = { ...basis, tournamentId: 999, streamType: 'challenge', spelerA: 'Anna' };
  assert.strictEqual(finaliseerActie(e), 'toernooi');
});

test('#102: challenge met minstens één spelersnaam → challenge', () => {
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'challenge', spelerA: 'Anna', spelerB: 'Bob' }), 'challenge');
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'challenge', spelerA: 'Anna' }), 'challenge');
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'challenge', spelerB: 'Bob' }), 'challenge');
});

test('#102: challenge zonder spelersnamen → niets (zou "? VS ?" tonen)', () => {
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'challenge' }), null);
});

test('#102: ad-hoc stream zonder tournamentId en zonder streamType → niets (ongewijzigd gedrag)', () => {
  assert.strictEqual(finaliseerActie({ ...basis }), null);
});

test('#102: ander streamType dan challenge (bijv. custom/league) zonder tournamentId → niets', () => {
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'custom', spelerA: 'Anna' }), null);
});

test('niet gestopt, geen videoId, al gefinaliseerd, of opgegeven → nooit een actie', () => {
  assert.strictEqual(finaliseerActie({ ...basis, stopped: false, tournamentId: 1 }), null);
  assert.strictEqual(finaliseerActie({ ...basis, videoId: undefined, tournamentId: 1 }), null);
  assert.strictEqual(finaliseerActie({ ...basis, tournamentId: 1, finalized: true }), null);
  assert.strictEqual(finaliseerActie({ ...basis, tournamentId: 1, finalizeOpgegeven: true }), null);
  assert.strictEqual(finaliseerActie(null), null);
});

test('#82: competitie met beide teams → competitie', () => {
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'competitie', matchId: 1, niveau: 'Eerste Klasse', thuisteam: 'Mokum Mayhem', uitteam: 'Restless' }), 'competitie');
});

test('#82: competitie zonder (beide) teams → niets (entries van vóór v0.59)', () => {
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'competitie', matchId: 1 }), null);
  assert.strictEqual(finaliseerActie({ ...basis, streamType: 'competitie', thuisteam: 'Mokum Mayhem' }), null);
});
