const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDag, tafelVrijVoor } = require('../schedule/schedule');
const { dueRecords, effectiveStart } = require('../planning/planning');
const { leagueDueTables, herresolveerTafels } = require('../planning/league');
const { getTournament } = require('../cuescore');
const { enqueue, startCommandsFor } = require('../agent/commandQueue');
const { buildBroadcastTitle, buildBroadcastDescription, createBroadcast, bindBroadcast, ruimStreamKeyOp } = require('../youtube/broadcasts');
const { bouwBroadcastLimietAlert } = require('../notify/alertBericht');
const { stuurAlert } = require('../notify/verzenden');
const { isArmed } = require('../config/automation');

// Timer-Function (#9 + optie 2 + start-automatisering): maakt vooruit de
// YouTube-broadcasts aan én zet de start-/overlay-commando's voor de agent klaar.
// - Enkeldaagse toernooien: uit planning.json op basis van effectieve start.
// - Doorlopende competities (leagues): per avond, per camera-tafel met een
//   league-wedstrijd vandaag.
// Idempotent per tafel/dag (broadcasts/<datum>.json). Commando's worden alleen bij
// een NIEUW aangemaakte broadcast in de wachtrij gezet (niet nogmaals bij herhaling).

const CRON_ELKE_5_MIN = '0 */5 * * * *';
// Noodrem (#128): hoeveel broadcasts één tafel op één zaal-dag maximaal mag krijgen.
// Een normale avond heeft er één, hooguit een paar (vrijgemaakte tafel, tweede toernooi).
// Vier in een kwartier, zoals op 16-09, is altijd een storing. Instelbaar via app-setting
// MAX_BROADCASTS_PER_TAFEL voor het geval een avond ooit echt meer nodig heeft.
const MAX_PER_TAFEL_PER_DAG = Number(process.env.MAX_BROADCASTS_PER_TAFEL) || 4;

async function verwerk(now, context) {
  if (!isArmed()) {
    context.log('[createBroadcasts] AUTOMATION_ARMED != true → slapend; geen broadcasts aangemaakt.');
    return;
  }
  const tables = (await readJson('config/tables.json', [])) || [];
  const planning = (await readJson('planning.json', [])) || [];
  const tableById = new Map(tables.map((t) => [Number(t.tableNumber), t]));

  const datum = zaalDag(now);
  const broadcastsPad = `broadcasts/${datum}.json`;
  const store = (await readJson(broadcastsPad, {})) || {};

  const nieuweCommandos = [];
  // Tafels waarvoor de noodrem zojuist is aangeslagen (#128) — eenmalig alarmeren.
  const teMeldenLimiet = [];

  // Maakt (idempotent) een broadcast voor een tafel en zet de start-commando's klaar.
  async function maakBroadcast(rec, tafelNr, startIso) {
    // Bezet (draaiend) of vandaag al gemaakt voor dít toernooi → niets doen. Een gestopte
    // ad-hoc/ander-toernooi-entry telt níet als bezet, zodat een geplande start de tafel
    // alsnog claimt (#74).
    if (!tafelVrijVoor(store, tafelNr, rec.tournamentId)) return;
    // Noodrem (#128): hoeveel broadcasts hebben we vandaag al voor deze tafel gemaakt?
    // Op 16-09 waren dat er vier in een kwartier, doordat twee planning-records voor
    // hetzelfde toernooi elkaar de tafel afhandig maakten (#127). Er was toen niets dat
    // dat tegenhield — het resultaat was een reeks video's van 51 seconden op het kanaal.
    // De teller telt door over opeenvolgende entries van dezelfde tafel heen.
    const vorige = store[String(tafelNr)];
    const gemaakt = (Number(vorige && vorige.gemaaktVandaag) || 0) + 1;
    if (gemaakt > MAX_PER_TAFEL_PER_DAG) {
      if (!vorige.limietGemeld) {
        store[String(tafelNr)] = { ...vorige, limietGemeld: true };
        teMeldenLimiet.push({ tableNumber: Number(tafelNr), naam: rec.name || '', gemaakt: gemaakt - 1 });
      }
      context.warn(`[FOUT] [createBroadcasts] tafel ${tafelNr}: al ${gemaakt - 1} broadcasts vandaag — noodrem (#128), er wordt niets meer aangemaakt voor "${rec.name || '?'}". Zoek uit waarom deze tafel steeds opnieuw geclaimd wordt.`);
      return;
    }
    const table = tableById.get(Number(tafelNr));
    if (!table || !table.streamId) {
      context.warn(`[FOUT] Tafel ${tafelNr} heeft geen streamId in config/tables.json — overslaan.`);
      return;
    }
    const title = buildBroadcastTitle({ tafel: tafelNr, toernooinaam: rec.name || '' });
    const description = buildBroadcastDescription({ toernooinaam: rec.name || '' });
    // Stream key eerst vrijmaken (#78) — zie de toelichting in youtube/opruimen.js.
    // Mislukt dit, dan starten we alsnog: geen uitzending is erger dan een gekaapte.
    try {
      for (const o of await ruimStreamKeyOp(table.streamId)) {
        const hoe = o.gelukt ? 'gelukt' : `MISLUKT (${o.fout})`;
        context.log(`[createBroadcasts] tafel ${tafelNr}: oude broadcast ${o.videoId} (${o.status}) ${o.actie} — ${hoe} — "${o.titel}"`);
      }
    } catch (e) {
      context.warn(`[WAARSCHUWING] [createBroadcasts] tafel ${tafelNr}: opruimen van de stream key mislukt (${e.message}) — we starten toch.`);
    }
    try {
      const broadcast = await createBroadcast({ title, description, scheduledStartTime: startIso, privacyStatus: rec.visibility || 'public' });
      await bindBroadcast({ broadcastId: broadcast.id, streamId: table.streamId });
      store[String(tafelNr)] = {
        tableNumber: Number(tafelNr),
        tournamentId: rec.tournamentId,
        tournamentName: rec.name || '',
        videoId: broadcast.id,
        broadcastId: broadcast.id,
        title,
        scheduledStart: startIso,
        // Voor de noodrem (#128) en voor vrijmaken, dat een vers aangemaakte uitzending
        // met rust moet laten (anders sluit het de broadcast die er net voor is gemaakt).
        gemaaktVandaag: gemaakt,
        aangemaaktOp: now.toISOString(),
      };
      // Agent: OBS starten + overlays op de gewenste stand. preflight:true → de agent
      // controleert eerst of de camera live beeld geeft (geen bevroren/dode cam de lucht in, #43).
      const overlayBron = table.overlaySources || undefined;
      nieuweCommandos.push(...startCommandsFor(rec, Number(tafelNr), overlayBron, { preflight: true }));
      // Warning-niveau (26-08, #114-vervolg): logLevel.default staat op Warning (#110), dus
      // een gewone .log() haalt de log-omgeving niet meer. Zonder deze regel was er op
      // 25-08 geen enkel spoor van de startpoging te vinden — precies het gat waardoor het
      // ochtendrapport (dat alleen ziet wat de backend zelf besloot) niets bijzonders meldde
      // terwijl de stream in werkelijkheid niet vanzelf aansloeg.
      context.warn(`[OK] Broadcast + startcommando's: tafel ${tafelNr} — "${title}" (${broadcast.id})`);
    } catch (e) {
      context.warn(`[FOUT] Broadcast tafel ${tafelNr} mislukt: ${e.message}`);
    }
  }

  // 1) Enkeldaagse toernooien
  for (const rec of dueRecords(planning, now)) {
    const start = effectiveStart(rec);
    // Tafel-herresolutie op start-moment: alleen de geplande tafels waar Cuescore nu
    // echt een wedstrijd op zet (voorkomt lege 15/16). Cuescore onbereikbaar of loting
    // nog niet gemaakt → val terug op de geplande tafels.
    let tafels = rec.tafels || [];
    if (rec.tournamentId != null) {
      try {
        const tournament = await getTournament(rec.tournamentId);
        tafels = herresolveerTafels(tournament, rec.tafels || [], now);
        context.log(`[createBroadcasts] tafel-herresolutie toernooi ${rec.tournamentId}: [${(rec.tafels || []).join(',')}] → [${tafels.join(',')}]`);
      } catch (e) {
        // Cuescore zegt expliciet dat dit toernooi niet bestaat (#127). Dan is er niets om
        // uit te zenden: doorgaan levert een broadcast op die aan een dood ID hangt — geen
        // podium, geen auto-stop, en op 16-09 een create/stop-lus met vier broadcasts in
        // een kwartier (#128). Overslaan, en luid loggen zodat het opvalt.
        if (e.toernooiOnbekend) {
          context.warn(`[FOUT] [createBroadcasts] toernooi ${rec.tournamentId} ("${rec.name || '?'}") bestaat niet meer bij Cuescore — géén broadcast aangemaakt voor tafels [${tafels.join(',')}]. Ruim dit record op in de Toernooi planner.`);
          continue;
        }
        // Cuescore onbereikbaar of loting nog niet gemaakt → val terug op de geplande tafels.
        context.warn(`[createBroadcasts] herresolutie mislukt (${e.message}) → geplande tafels [${tafels.join(',')}]`);
      }
    }
    for (const tafelNr of tafels.filter((t) => tafelVrijVoor(store, t, rec.tournamentId))) {
      await maakBroadcast(rec, tafelNr, start);
    }
  }

  // 2) Doorlopende competities (per avond)
  // `planned` is óók voor competities de arm-vlag (#86). Stond hier eerder alleen
  // `enabled`, en dat is de standaardwaarde bij import — een doorlopende league die
  // binnenkomt zou dan meteen elke avond met een wedstrijd op een cameratafel gaan
  // streamen, ook op avonden waarop niemand dat wil. Nu geldt overal hetzelfde:
  // plannen in de Toernooi planner = draaien.
  for (const rec of planning.filter((r) => r.type === 'competition' && r.enabled !== false && r.planned === true)) {
    let tournament;
    try {
      tournament = await getTournament(rec.tournamentId);
    } catch (e) {
      context.warn(`[WAARSCHUWING] League ${rec.tournamentId} ophalen mislukt: ${e.message}`);
      continue;
    }
    for (const { tableNumber, earliestStart } of leagueDueTables(tournament, rec, now)) {
      await maakBroadcast(rec, tableNumber, earliestStart);
    }
  }

  await writeJson(broadcastsPad, store);

  // Nieuwe commando's (met id + tijd) achteraan de wachtrij zetten.
  if (nieuweCommandos.length > 0) {
    const bestaand = (await readJson('commands.json', [])) || [];
    const metId = nieuweCommandos.map((c) => ({ id: crypto.randomUUID(), createdAt: now.toISOString(), ...c }));
    await writeJson('commands.json', enqueue(bestaand, metId));
    context.warn(`[OK] ${metId.length} commando's toegevoegd aan de wachtrij.`);
  }

  // Noodrem aangeslagen (#128) → eenmalig alarmeren. Ná het wegschrijven van de store, en
  // in een eigen try: een mislukte verzending mag de rest van de run niet omver halen.
  // `limietGemeld` op de entry voorkomt dat dit elke vijf minuten opnieuw afgaat.
  for (const m of teMeldenLimiet) {
    context.warn(`[ALARM] tafel ${m.tableNumber}: noodrem op het aanmaken van uitzendingen (${m.gemaakt} vandaag) — alarm wordt verstuurd.`);
    try {
      const res = await stuurAlert(bouwBroadcastLimietAlert(m));
      context.warn(`[ALARM] tafel ${m.tableNumber}: mail ${res.mail.verstuurd ? 'verstuurd' : `overgeslagen (${res.mail.reden})`}, ntfy ${res.ntfy.verstuurd ? 'verstuurd' : `overgeslagen (${res.ntfy.reden})`}.`);
    } catch (e) {
      context.warn(`[WAARSCHUWING] [ALARM] tafel ${m.tableNumber}: versturen mislukt: ${e.message}`);
    }
  }
}

app.timer('createBroadcasts', {
  schedule: CRON_ELKE_5_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
