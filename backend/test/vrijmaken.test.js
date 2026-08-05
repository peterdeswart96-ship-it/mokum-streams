const test = require('node:test');
const assert = require('node:assert');
const { vrijTeMaken } = require('../src/planning/vrijmaken');

// Tafels vrijmaken vóór een ingepland toernooi (#93).
//
// Aanleiding is de avond van 03-08: om 16:40 startte iemand een losse challenge op tafel 1
// en vergat die te stoppen. Diezelfde tafel werd 's avonds voor het toernooi gebruikt, met
// als resultaat één video van acht en een half uur waarvan de eerste tweeënhalf uur leeg.

const toernooi = (extra) => ({
  tournamentId: 75880936,
  name: 'Fluke ranking 9ball Seizoen 3 #26',
  type: 'tournament',
  planned: true,
  enabled: true,
  tafels: [1, 3],
  startOverride: '2026-08-04T17:30:00Z', // 19:30 Amsterdam
  ...extra,
});

const challenge = { tableNumber: 1, videoId: 'I9a3epTPE5I', adhoc: true, tournamentId: null, stopped: false };

const OM = (u, m) => new Date(`2026-08-04T${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

test('#93: een vergeten challenge wordt een half uur voor de start gesloten', () => {
  const r = vrijTeMaken([toernooi()], { 1: challenge }, OM(17, 5)); // 19:05 Amsterdam
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].tableNumber, 1);
  assert.strictEqual(r[0].videoId, 'I9a3epTPE5I');
  assert.match(r[0].reden, /losse uitzending/);
  assert.match(r[0].reden, /Fluke ranking/);
});

test('#93: buiten het venster gebeurt er niets', () => {
  // Te vroeg: 18:30 Amsterdam, een uur voor de start.
  assert.deepStrictEqual(vrijTeMaken([toernooi()], { 1: challenge }, OM(16, 30)), []);
  // Te laat: ná de starttijd hoort de tafel bij het toernooi. Zou een net aangemaakte
  // uitzending anders meteen weer sluiten.
  assert.deepStrictEqual(vrijTeMaken([toernooi()], { 1: challenge }, OM(17, 45)), []);
});

test('#93: de uitzending van het toernooi zelf blijft met rust', () => {
  // Iemand heeft alvast met de hand gestart en gekoppeld — die moet blijven staan.
  const eigen = { tableNumber: 1, videoId: 'abc', tournamentId: 75880936, stopped: false };
  assert.deepStrictEqual(vrijTeMaken([toernooi()], { 1: eigen }, OM(17, 5)), []);
});

test('#93: een uitzending van een ánder toernooi wordt wél gesloten', () => {
  const ander = { tableNumber: 1, videoId: 'xyz', tournamentId: 99999999, stopped: false };
  const r = vrijTeMaken([toernooi()], { 1: ander }, OM(17, 5));
  assert.strictEqual(r.length, 1);
  assert.match(r[0].reden, /ander toernooi/);
});

test('#93: al gestopte uitzendingen tellen niet mee', () => {
  assert.deepStrictEqual(vrijTeMaken([toernooi()], { 1: { ...challenge, stopped: true } }, OM(17, 5)), []);
});

test('#93: tafels buiten de planning blijven ongemoeid', () => {
  // De challenge staat op tafel 16; het toernooi speelt op 1 en 3.
  const op16 = { 16: { ...challenge, tableNumber: 16 } };
  assert.deepStrictEqual(vrijTeMaken([toernooi()], op16, OM(17, 5)), []);
});

test('#93: een toernooi dat niet is ingepland maakt niets vrij', () => {
  assert.deepStrictEqual(vrijTeMaken([toernooi({ planned: false })], { 1: challenge }, OM(17, 5)), []);
  assert.deepStrictEqual(vrijTeMaken([toernooi({ enabled: false })], { 1: challenge }, OM(17, 5)), []);
  assert.deepStrictEqual(vrijTeMaken([toernooi({ geannuleerd: true })], { 1: challenge }, OM(17, 5)), []);
});

test('#93: beide tafels worden vrijgemaakt als er op allebei iets openstaat', () => {
  const store = { 1: challenge, 3: { ...challenge, tableNumber: 3, videoId: 'def' } };
  const r = vrijTeMaken([toernooi()], store, OM(17, 5));
  assert.deepStrictEqual(r.map((x) => x.tableNumber).sort(), [1, 3]);
});

test('#93: dezelfde tafel wordt niet twee keer gemeld bij twee toernooien', () => {
  const twee = [toernooi(), toernooi({ tournamentId: 111, name: 'Tweede' })];
  const r = vrijTeMaken(twee, { 1: challenge }, OM(17, 5));
  assert.strictEqual(r.length, 1);
});

test('#93: het venster is instelbaar', () => {
  // Met een uur speling wordt 18:45 Amsterdam wél meegenomen.
  const r = vrijTeMaken([toernooi()], { 1: challenge }, OM(16, 45), { minutenVoor: 60 });
  assert.strictEqual(r.length, 1);
});

test('#93: rommel in de planning of de opslag valt niet om', () => {
  assert.deepStrictEqual(vrijTeMaken(null, null, OM(17, 5)), []);
  assert.deepStrictEqual(vrijTeMaken([null, {}, toernooi({ startOverride: 'geen datum' })], {}, OM(17, 5)), []);
  assert.deepStrictEqual(vrijTeMaken([toernooi()], { 1: { videoId: null } }, OM(17, 5)), []);
});

// Deze test bewaakt een afhankelijkheid tussen twee bestanden die je makkelijk over het
// hoofd ziet. createBroadcasts maakt de uitzending aan op preRoll-minuten vóór de start —
// dus MIDDENIN het vrijmaak-venster. Zou die entry geen tournamentId krijgen, dan sluit
// deze regel een minuut later de zojuist gestarte uitzending weer af.
test('#93: de entry die createBroadcasts schrijft wordt NIET vrijgemaakt', () => {
  // Exact de velden uit backend/src/functions/createBroadcasts.js.
  const versGemaakt = {
    tableNumber: 1,
    tournamentId: 75880936,
    tournamentName: 'Fluke ranking 9ball Seizoen 3 #26',
    videoId: 'nieuw123',
    broadcastId: 'nieuw123',
    title: 'Tafel 1 Fluke ranking 9ball Seizoen 3 #26',
    scheduledStart: '2026-08-04T17:30:00Z',
  };
  // 19:21 Amsterdam: één minuut na de automatische start, nog binnen het venster.
  assert.deepStrictEqual(vrijTeMaken([toernooi()], { 1: versGemaakt }, OM(17, 21)), []);
});

// Het gat dat op 05-08 aan het licht kwam bij de vraag "wat als iemand om 17:00 een challenge
// start en die vergeet te stoppen?". De automatische koppeling (#69) hangt zo'n losse
// uitzending alsnog aan het toernooi van die avond. Hij draagt dan het juiste tournamentId en
// werd daarom overgeslagen — waardoor de tafel om starttijd bezet was, createBroadcasts geen
// eigen uitzending aanmaakte, en je één video kreeg die uren te vroeg begon. Precies wat er
// op 03-08 misging.
test('#93: een AUTOMATISCH GEKOPPELDE uitzending wordt wél vrijgemaakt', () => {
  const gekoppeld = {
    tableNumber: 1,
    videoId: 'I9a3epTPE5I',
    adhoc: false,                       // de koppeling zet dit op false
    tournamentId: 75880936,             // en zet het toernooi erin
    autoGekoppeld: '2026-08-04T16:30:00Z', // ← hieraan herken je dat 'ie geadopteerd is
    stopped: false,
  };
  const r = vrijTeMaken([toernooi()], { 1: gekoppeld }, OM(17, 5));
  assert.strictEqual(r.length, 1);
  assert.match(r[0].reden, /begon te vroeg/);
});

test('#93: een uitzending die MET het toernooi is gestart blijft met rust', () => {
  // Zelfde tournamentId, maar zonder autoGekoppeld: iemand heeft 'm bewust voor dit
  // toernooi gestart, of createBroadcasts heeft 'm net aangemaakt.
  const eigen = { tableNumber: 1, videoId: 'abc', tournamentId: 75880936, stopped: false };
  assert.deepStrictEqual(vrijTeMaken([toernooi()], { 1: eigen }, OM(17, 5)), []);
});
