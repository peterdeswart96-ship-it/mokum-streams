const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { getUpcomingTournaments } = require('../cuescore');
const { mergePlanning, STANDAARD_DEFAULTS } = require('../planning/planning');

// Timer-Function: importeert de geplande Mokum-toernooien uit Cuescore en werkt
// planning.json bij. Nieuwe toernooien krijgen de standaard-instellingen; bestaande
// records behouden hun handmatige keuzes (zie planning.js / api-contract v0.4).
// Draait elk uur (toernooien zijn er pas na 18:00, dus uurlijks is ruim genoeg).

const CRON_ELK_UUR = '0 0 * * * *';

async function verwerk(now, context) {
  const defaults = (await readJson('config/defaults.json', STANDAARD_DEFAULTS)) || STANDAARD_DEFAULTS;
  const bestaand = (await readJson('planning.json', [])) || [];

  let imported;
  try {
    imported = await getUpcomingTournaments({ now, days: 14 });
  } catch (e) {
    context.log(`[FOUT] Cuescore-import mislukt, planning ongewijzigd: ${e.message}`);
    return;
  }

  const samengevoegd = mergePlanning(bestaand, imported, defaults);
  await writeJson('planning.json', samengevoegd);
  context.log(`[OK] Planning bijgewerkt: ${imported.length} geïmporteerd, ${samengevoegd.length} records totaal.`);
}

app.timer('importPlanning', {
  schedule: CRON_ELK_UUR,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
