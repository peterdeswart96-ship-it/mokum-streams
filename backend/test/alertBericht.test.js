const test = require('node:test');
const assert = require('node:assert');
const { bouwStreamFalenAlert, bouwBroadcastLimietAlert } = require('../src/notify/alertBericht');

test('bouwStreamFalenAlert: bevat tafel, toernooinaam, pogingen en een Studio-link', () => {
  const { onderwerp, tekst } = bouwStreamFalenAlert({
    tableNumber: 1, tournamentName: 'Mokum 8ball Ranking Seizoen 4 #1', videoId: 'abc123', pogingen: 3,
  });
  assert.match(onderwerp, /Tafel 1/);
  assert.match(onderwerp, /Mokum 8ball Ranking Seizoen 4 #1/);
  assert.match(tekst, /3 automatische pogingen/);
  assert.match(tekst, /https:\/\/studio\.youtube\.com\/video\/abc123\/livestreaming/);
});

test('bouwStreamFalenAlert: zonder videoId geen kapotte link', () => {
  const { tekst } = bouwStreamFalenAlert({ tableNumber: 3, tournamentName: 'Fluke ranking', videoId: null, pogingen: 3 });
  assert.doesNotMatch(tekst, /studio\.youtube\.com/);
});

test('bouwStreamFalenAlert: zonder toernooinaam valt terug op een leesbare tekst', () => {
  const { onderwerp } = bouwStreamFalenAlert({ tableNumber: 15, tournamentName: '', videoId: null, pogingen: 3 });
  assert.match(onderwerp, /onbekend toernooi/);
});

// #128: alarm bij de noodrem op het aanmaken van broadcasts.
test('bouwBroadcastLimietAlert noemt tafel, aantal en de waarschijnlijke oorzaak', () => {
  const { onderwerp, tekst } = bouwBroadcastLimietAlert({
    tableNumber: 1, naam: 'Mokum MEGA Winter Ranking #4', gemaakt: 4,
  });

  assert.match(onderwerp, /Tafel 1/);
  assert.match(tekst, /4 uitzendingen/);
  assert.match(tekst, /Mokum MEGA Winter Ranking #4/);
  assert.match(tekst, /Toernooi planner/, 'wijst naar waar je het oplost');
});

test('bouwBroadcastLimietAlert valt terug op een leesbare naam als het toernooi onbekend is', () => {
  const { tekst } = bouwBroadcastLimietAlert({ tableNumber: 3, naam: '', gemaakt: 5 });
  assert.match(tekst, /onbekend toernooi/);
});
