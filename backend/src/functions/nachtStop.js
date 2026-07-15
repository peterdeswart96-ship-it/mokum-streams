const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { enqueue } = require('../agent/commandQueue');
const { isNachtVenster, teStoppenNachts } = require('../planning/nachtstop');

// Timer-Function: nachtelijke veiligheids-stop. Na sluitingstijd (default 02:00
// Amsterdam) stopt 'ie ALLE nog-lopende streams — óók handmatig gestarte — zodat er
// nooit iets 's nachts blijft doorzenden (het bevroren-beeld-probleem van 14-07).
// Bewust NIET achter AUTOMATION_ARMED: stoppen is altijd veilig en dít is juist het
// vangnet. Idempotent: gestopte entries worden overgeslagen. Aanpasbaar via de
// app-settings NACHT_STOP_SLUITING_MIN (default 120=02:00) en _OCHTEND_MIN (default 480=08:00).

const CRON_ELKE_30_MIN = '0 */30 * * * *';
const SLUITING = Number(process.env.NACHT_STOP_SLUITING_MIN) || 120; // 02:00
const OCHTEND = Number(process.env.NACHT_STOP_OCHTEND_MIN) || 480; // 08:00

async function verwerk(now, context) {
  const { minutenVanDeDag, datum } = zaalDelen(now);
  if (!isNachtVenster(minutenVanDeDag, { sluiting: SLUITING, ochtend: OCHTEND })) return;

  // Een avondstream zit na middernacht nog in de store van gisteren → check beide dagen.
  const datumGisteren = zaalDelen(new Date(now.getTime() - 24 * 3600 * 1000)).datum;
  const paden = [...new Set([`broadcasts/${datum}.json`, `broadcasts/${datumGisteren}.json`])];

  const nieuweCommandos = [];
  for (const pad of paden) {
    const store = (await readJson(pad, {})) || {};
    const tafels = teStoppenNachts(store);
    if (!tafels.length) continue;
    for (const tn of tafels) {
      nieuweCommandos.push({ type: 'stopStream', tableNumber: tn });
      const key = String(tn);
      if (store[key]) store[key] = { ...store[key], stopped: true };
    }
    await writeJson(pad, store);
  }

  if (nieuweCommandos.length > 0) {
    const commands = (await readJson('commands.json', [])) || [];
    const metId = nieuweCommandos.map((c) => ({ id: crypto.randomUUID(), createdAt: now.toISOString(), ...c }));
    await writeJson('commands.json', enqueue(commands, metId));
    context.log(`[nachtStop] veiligheids-stop: ${metId.length} stream(s) gestopt — tafels ${nieuweCommandos.map((c) => c.tableNumber).join(', ')}`);
  }
}

app.timer('nachtStop', {
  schedule: CRON_ELKE_30_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
