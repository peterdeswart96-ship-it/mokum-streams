const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDelen } = require('../schedule/schedule');
const { agentBewaking } = require('../planning/agentBewaking');
const { bouwAgentOfflineAlert, bouwAgentHerstelAlert } = require('../notify/alertBericht');
const { stuurAlert } = require('../notify/verzenden');
const { isAgentAlarmAan, agentAlarmStilMs } = require('../config/automation');

// Timer-Function: bewaakt de hartslag van de agent (#132). Zwijgt de OBS-pc langer dan
// AGENT_ALARM_MIN minuten (standaard 10), dan gaat er eenmalig een alarm uit (mail + ntfy), en
// een herstelmelding zodra hij terug is. De beslislogica staat in planning/agentBewaking.js.
//
// Onafhankelijk van AUTOMATION_ARMED en van of er een stream gepland is: juist een pc die
// buiten een stream om wegvalt was het gat (17-09, 02:16 → ontdekt om 10:00).

// Seconde 30, zodat deze timer niet samenvalt met de andere (0, 20, 40, 50).
const CRON_ELKE_MIN = '30 * * * * *';
const STAAT_PAD = 'agent/alarm.json';

async function verwerk(now, context) {
  if (!isAgentAlarmAan()) return;
  const heartbeat = await readJson('agent/heartbeat.json', null);
  const staat = (await readJson(STAAT_PAD, {})) || {};
  const { minutenVanDeDag } = zaalDelen(now);
  const stilMs = agentAlarmStilMs();

  const besluit = agentBewaking(heartbeat, staat, now.getTime(), minutenVanDeDag, { stilMs });
  if (besluit.actie === 'geen') return;

  // Eerst de staat bewaren: een mislukte verzending mag geen spervuur aan mails geven
  // (zelfde keuze als bij het stream-alarm in checkStops: liever een gemiste melding).
  await writeJson(STAAT_PAD, besluit.staat);

  let bericht;
  if (besluit.actie === 'alarm') {
    const duurMin = Math.round((now.getTime() - Date.parse(heartbeat.lastSeen)) / 60000);
    bericht = bouwAgentOfflineAlert({ lastSeen: heartbeat.lastSeen, duurMin });
    context.warn(`[ALARM] agent offline: al ${duurMin} min geen hartslag (laatst ${heartbeat.lastSeen}) — alarm wordt verstuurd (#132).`);
  } else {
    bericht = bouwAgentHerstelAlert({ sindsLastSeen: besluit.sindsLastSeen });
    context.warn(`[OK] agent weer online (was weg sinds ${besluit.sindsLastSeen}) — herstelmelding wordt verstuurd (#132).`);
  }
  try {
    const res = await stuurAlert(bericht);
    context.warn(`[ALARM] agent: mail ${res.mail.verstuurd ? 'verstuurd' : `overgeslagen (${res.mail.reden})`}, ntfy ${res.ntfy.verstuurd ? 'verstuurd' : `overgeslagen (${res.ntfy.reden})`}.`);
  } catch (e) {
    context.warn(`[WAARSCHUWING] [ALARM] agent: versturen mislukt: ${e.message}`);
  }
}

app.timer('agentBewaking', {
  schedule: CRON_ELKE_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
