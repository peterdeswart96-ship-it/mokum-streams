const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { getRecentFinished, getUpcomingTournaments } = require('../cuescore');
const { bouwWinnaars, bouwKomende, magSheetsHerbouwen } = require('../sheets/sheets');
const { zaalDelen } = require('../schedule/schedule');

// Info-sheets voor de jumbotron (#72):
//   GET /api/sheets → { generatedAt, winners: [...], upcoming: [...] }
//
// - winners  = recente kampioenen (winnaar = wie de finale won), nieuwste eerst.
// - upcoming = geplande toernooien, vroegste eerst (met aanvangstijd i.p.v. inschrijf-aantal,
//   want dat aantal geeft Cuescore niet terug voor een nog-niet-geloot toernooi).
//
// Server-cache in blob `sheets.json` (~30 min). Het opbouwen kost een scrape + een handvol
// detail-calls; door te cachen belasten we Cuescore niet bij elke jumbotron-poll. Bij een
// verlopen cache herbouwt dit endpoint zelf (geen aparte timer nodig).
//
// #94: het pauzescherm draait op vier OBS-instanties tegelijk, die allemaal op dezelfde
// seconde een verlopen cache zien en dan alle vier gingen herbouwen (3-4x te veel
// Cuescore-verkeer per omslag). Twee tegenmaatregelen hieronder: (1) een in-memory
// slotje zodat alleen de eerste aanvraag echt herbouwt — de rest krijgt heel even de oude
// versie; (2) 's nachts (02:00-12:00) helemaal niet herbouwen, want dan kijkt niemand mee.

const PAD = 'sheets.json';
const VERS_MS = 30 * 60 * 1000;
// In-flight herbouw-promise, gedeeld door gelijktijdige aanvragen binnen dit functie-
// instance. Geen distributed lock nodig: dit endpoint heeft maar een handvol pollers.
let herbouwInGang = null;

const CORS_ALLOWLIST = new Set([
  'https://mokum-streams.pdscloud.nl',
  'http://localhost:5173',
  'http://localhost:4173',
]);
function corsHeaders(request) {
  const origin = request && request.headers && request.headers.get('origin');
  return origin && CORS_ALLOWLIST.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}
const json = (status, body, request) => ({ status, jsonBody: body, headers: corsHeaders(request) });

async function bouwSheets(now) {
  const [finished, upcoming] = await Promise.all([
    getRecentFinished({ now }).catch(() => []),
    getUpcomingTournaments({ now, days: 21 }).catch(() => []),
  ]);
  return {
    generatedAt: now.toISOString(),
    winners: bouwWinnaars(finished, { max: 5 }),
    upcoming: bouwKomende(upcoming, { max: 5 }),
  };
}

app.http('publicSheets', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sheets',
  handler: async (request, context) => {
    const now = new Date();
    let data = await readJson(PAD, null);
    const vers = data && data.generatedAt && (now - new Date(data.generatedAt) < VERS_MS);
    if (vers) return json(200, data, request);

    // Verlopen, maar we hébben al iets én het is nacht → gewoon de oude versie blijven
    // serveren, niet herbouwen (#94).
    const { minutenVanDeDag } = zaalDelen(now);
    if (data && !magSheetsHerbouwen(minutenVanDeDag)) return json(200, data, request);

    if (herbouwInGang) {
      // Een gelijktijdige aanvraag herbouwt al — niet nog een keer Cuescore belasten.
      if (data) return json(200, data, request); // heel even de oude versie
      try {
        data = await herbouwInGang; // eerste keer ooit: geen cache om op terug te vallen
      } catch (e) {
        return json(502, { error: 'sheets bouwen mislukt', winners: [], upcoming: [] }, request);
      }
      return json(200, data, request);
    }

    herbouwInGang = bouwSheets(now);
    try {
      data = await herbouwInGang;
      await writeJson(PAD, data);
      context.log(`[sheets] herbouwd: ${data.winners.length} winnaars, ${data.upcoming.length} komend`);
    } catch (e) {
      context.log(`[sheets] herbouw mislukt: ${e.message}`);
      if (!data) return json(502, { error: 'sheets bouwen mislukt', winners: [], upcoming: [] }, request);
      // Anders: serveer de (verlopen) cache — beter oud dan leeg.
    } finally {
      herbouwInGang = null;
    }
    return json(200, data, request);
  },
});
