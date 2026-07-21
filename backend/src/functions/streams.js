const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { enqueue, isTableBusy, startCommandsFor, OVERLAY_BRON } = require('../agent/commandQueue');
const { buildBroadcastTitle, buildBroadcastDescription, createBroadcast, bindBroadcast } = require('../youtube/broadcasts');
const { isAdmin } = require('../admin/auth');

// Handmatige (ad-hoc) bediening vanuit het dashboard: een stream op een vrije
// camera starten/stoppen. Start maakt direct een YouTube-broadcast aan + bindt 'm,
// en zet een startStream-commando in de wachtrij voor de agent. Stop zet een
// stopStream-commando. Zie api-contract v0.5 (Beheer + Agent).

const json = (status, body) => ({ status, jsonBody: body });

async function leesBody(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// POST /api/manage/streams/start — body { tableNumber, title? }
app.http('adminStreamStart', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/streams/start',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const body = await leesBody(request);
    if (!body) return json(400, { error: 'ongeldige of lege JSON' });

    const tafelNr = Number(body.tableNumber);
    if (!Number.isInteger(tafelNr)) return json(400, { error: 'tableNumber (geheel getal) is verplicht' });

    const tables = (await readJson('config/tables.json', [])) || [];
    const table = tables.find((t) => Number(t.tableNumber) === tafelNr);
    if (!table || !table.streamId) return json(400, { error: `tafel ${tafelNr} heeft geen streamId in config/tables.json` });

    const { datum } = zaalDelen(new Date());
    const broadcastsPad = `broadcasts/${datum}.json`;
    const store = (await readJson(broadcastsPad, {})) || {};
    if (isTableBusy(store, tafelNr)) return json(409, { error: `tafel ${tafelNr} is vandaag al in gebruik` });

    const title = buildBroadcastTitle({ tafel: tafelNr, toernooinaam: body.title || '' });
    const description = buildBroadcastDescription({ toernooinaam: body.title || '' });
    const start = new Date().toISOString();
    // Voor een veilige test kun je privacy: "unlisted" (of "private") meesturen;
    // standaard is de stream "public".
    const privacyStatus = ['unlisted', 'private', 'public'].includes(body.privacy) ? body.privacy : 'public';

    let broadcast;
    try {
      broadcast = await createBroadcast({ title, description, scheduledStartTime: start, privacyStatus });
      await bindBroadcast({ broadcastId: broadcast.id, streamId: table.streamId });
    } catch (e) {
      context.log(`[FOUT] ad-hoc broadcast tafel ${tafelNr}: ${e.message}`);
      return json(502, { error: `YouTube: ${e.message}` });
    }

    // Koppel (optioneel) een Cuescore-toernooi. Met koppeling wordt de stream BEHEERD:
    // de auto-stop (podium-grace) mag 'm sluiten na de finale en de finalize-timer zet
    // er thumbnail + hoofdstukken op. Zonder koppeling blijft 'ie ad-hoc (handmatig sluiten).
    const tournamentId = body.tournamentId != null && body.tournamentId !== '' ? Number(body.tournamentId) : null;
    store[String(tafelNr)] = {
      tableNumber: tafelNr,
      tournamentId,
      tournamentName: body.title || '',
      videoId: broadcast.id,
      broadcastId: broadcast.id,
      title,
      scheduledStart: start,
      adhoc: !tournamentId,
    };
    await writeJson(broadcastsPad, store);

    // startStream + setOverlay (op basis van de meegegeven overlays; standaard aan).
    const commands = (await readJson('commands.json', [])) || [];
    const nieuwe = startCommandsFor({ overlays: body.overlays }, tafelNr).map((c) => ({
      id: crypto.randomUUID(),
      createdAt: start,
      ...c,
    }));
    await writeJson('commands.json', enqueue(commands, nieuwe));

    return json(200, { table: store[String(tafelNr)], commands: nieuwe });
  },
});

// POST /api/manage/streams/overlay — overlay(s) live aan/uit op een lopende stream.
// body { tableNumber, sponsors?, scoreboard?, cuescoreLogo?, jumbotron?, pauzemelding? } (bool)
app.http('adminStreamOverlay', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/streams/overlay',
  handler: async (request) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const body = await leesBody(request);
    if (!body) return json(400, { error: 'ongeldige of lege JSON' });

    const tafelNr = Number(body.tableNumber);
    if (!Number.isInteger(tafelNr)) return json(400, { error: 'tableNumber (geheel getal) is verplicht' });

    const now = new Date().toISOString();
    const cmds = [];
    for (const [sleutel, sourceName] of Object.entries(OVERLAY_BRON)) {
      if (typeof body[sleutel] === 'boolean') {
        cmds.push({ type: 'setOverlay', tableNumber: tafelNr, sourceName, enabled: body[sleutel] });
      }
    }
    if (!cmds.length) return json(400, { error: `geef minimaal één overlay (${Object.keys(OVERLAY_BRON).join('/')}) als boolean op` });

    const withMeta = cmds.map((c) => ({ id: crypto.randomUUID(), createdAt: now, ...c }));
    const commands = (await readJson('commands.json', [])) || [];
    await writeJson('commands.json', enqueue(commands, withMeta));

    return json(200, { commands: withMeta });
  },
});

// POST /api/manage/streams/stop — body { tableNumber }
app.http('adminStreamStop', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/streams/stop',
  handler: async (request) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' });
    const body = await leesBody(request);
    if (!body) return json(400, { error: 'ongeldige of lege JSON' });

    const tafelNr = Number(body.tableNumber);
    if (!Number.isInteger(tafelNr)) return json(400, { error: 'tableNumber (geheel getal) is verplicht' });

    const commands = (await readJson('commands.json', [])) || [];
    const cmd = { id: crypto.randomUUID(), type: 'stopStream', tableNumber: tafelNr, createdAt: new Date().toISOString() };
    await writeJson('commands.json', enqueue(commands, cmd));

    // Markeer de dag-entry als gestopt zodat de camera weer vrij is voor een nieuwe start.
    const { datum } = zaalDelen(new Date());
    const broadcastsPad = `broadcasts/${datum}.json`;
    const store = (await readJson(broadcastsPad, {})) || {};
    if (store[String(tafelNr)]) {
      store[String(tafelNr)].stopped = true;
      await writeJson(broadcastsPad, store);
    }

    return json(200, { command: cmd });
  },
});
