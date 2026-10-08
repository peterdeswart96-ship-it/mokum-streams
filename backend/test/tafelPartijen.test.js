const test = require('node:test');
const assert = require('node:assert/strict');
const { partijUitOverlay, koppelPartijen, haalTafelPartijen } = require('../src/mokumCompetitie/tafelPartijen');

const overlay = (parentId, extra = {}) => ({
  status: 'PLAYING',
  match: { parentId, playerA: { name: 'Vasil' }, playerB: { name: 'Marieke' }, scoreA: 2, scoreB: 1, raceTo: 4, ...extra },
});

test('partijUitOverlay: lopende partij met teamwedstrijd erboven', () => {
  assert.deepEqual(partijUitOverlay(15, overlay(88259413)), {
    parentId: 88259413, tafel: 15, spelerA: 'Vasil', spelerB: 'Marieke', scoreA: 2, scoreB: 1, raceTo: 4,
  });
});

test('partijUitOverlay: WAITING, geen match of geen parentId geeft null', () => {
  assert.equal(partijUitOverlay(3, { status: 'WAITING' }), null);
  assert.equal(partijUitOverlay(3, { status: 'PLAYING' }), null);
  assert.equal(partijUitOverlay(3, overlay(0)), null);
  assert.equal(partijUitOverlay(3, overlay(null)), null);
  assert.equal(partijUitOverlay(3, null), null);
});

test('koppelPartijen: per teamwedstrijd, gesorteerd op tafel, vreemde partijen vallen weg', () => {
  const comp = [{ matchId: 1 }, { matchId: 2 }];
  const p = (tafel, parentId) => ({ parentId, tafel, spelerA: 'a', spelerB: 'b', scoreA: 0, scoreB: 0, raceTo: 4 });
  const r = koppelPartijen(comp, [p(16, 1), p(15, 1), p(1, 99)]);
  assert.deepEqual(r[0].partijen.map((x) => x.tafel), [15, 16]);
  assert.equal('parentId' in r[0].partijen[0], false);
  assert.deepEqual(r[1].partijen, []);
});

test('haalTafelPartijen: een falende tafel laat de rest ongemoeid', async () => {
  let n = 0;
  const haal = async () => { n += 1; if (n === 1) throw new Error('stuk'); return n === 2 ? overlay(7) : { status: 'WAITING' }; };
  const r = await haalTafelPartijen({ haal });
  assert.equal(n, 16);
  assert.equal(r.length, 1);
  assert.equal(r[0].parentId, 7);
});
