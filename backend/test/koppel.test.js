const test = require('node:test');
const assert = require('node:assert');
const { kiesToernooiVoorTafel, anderToernooiNogOpTafel } = require('../src/planning/koppel');

// Zaal-dag = Europe/Amsterdam. 19:00 lokaal op 22 juli = 17:00Z.
const NU = new Date('2026-07-22T19:00:00Z');

function m(table, start, status) {
  return { table: String(table), start, status };
}
function toernooi(id, name, matches) {
  return { id, name, matches };
}

test('koppelt aan het toernooi dat NU op die tafel speelt', () => {
  const lijst = [
    toernooi(1, 'Ander toernooi', [m(15, '2026-07-22T18:00:00Z', 'scheduled')]),
    toernooi(2, 'MEGA Summer #24', [m(1, '2026-07-22T18:30:00Z', 'playing')]),
  ];
  assert.strictEqual(kiesToernooiVoorTafel(lijst, 1, NU).id, 2);
});

test('speelt er niets, maar één toernooi heeft vandaag wedstrijden op die tafel → koppelen', () => {
  const lijst = [
    toernooi(2, 'MEGA Summer #24', [m(1, '2026-07-22T18:30:00Z', 'finished')]),
  ];
  assert.strictEqual(kiesToernooiVoorTafel(lijst, 1, NU).id, 2);
});

test('twee toernooien vandaag op dezelfde tafel en niets speelt → niet koppelen', () => {
  const lijst = [
    toernooi(2, 'Qualifier 3', [m(1, '2026-07-22T12:00:00Z', 'finished')]),
    toernooi(3, 'Qualifier 4', [m(1, '2026-07-22T18:00:00Z', 'scheduled')]),
  ];
  assert.strictEqual(kiesToernooiVoorTafel(lijst, 1, NU), null);
});

test('geen wedstrijd op die tafel → niet koppelen (stream blijft handmatig)', () => {
  const lijst = [toernooi(2, 'MEGA Summer #24', [m(3, '2026-07-22T18:30:00Z', 'playing')])];
  assert.strictEqual(kiesToernooiVoorTafel(lijst, 1, NU), null);
});

test('wedstrijd van een andere dag telt niet mee', () => {
  const lijst = [toernooi(2, 'Gisteren', [m(1, '2026-07-21T18:30:00Z', 'finished')])];
  assert.strictEqual(kiesToernooiVoorTafel(lijst, 1, NU), null);
});

test('anderToernooiNogOpTafel: ander toernooi met openstaande wedstrijd houdt de tafel open', () => {
  const lijst = [
    toernooi(2, 'Qualifier 3', [m(1, '2026-07-22T12:00:00Z', 'finished')]),
    toernooi(3, 'Qualifier 4', [m(1, '2026-07-22T20:00:00Z', 'scheduled')]),
  ];
  assert.strictEqual(anderToernooiNogOpTafel(lijst, 2, 1, NU), true);
  // Alles afgerond → tafel mag dicht.
  const klaar = [
    toernooi(2, 'Qualifier 3', [m(1, '2026-07-22T12:00:00Z', 'finished')]),
    toernooi(3, 'Qualifier 4', [m(1, '2026-07-22T20:00:00Z', 'finished')]),
  ];
  assert.strictEqual(anderToernooiNogOpTafel(klaar, 2, 1, NU), false);
  // Een ander toernooi op een ándere tafel blokkeert niets.
  const elders = [toernooi(3, 'Ander', [m(16, '2026-07-22T20:00:00Z', 'scheduled')])];
  assert.strictEqual(anderToernooiNogOpTafel(elders, 2, 1, NU), false);
});
