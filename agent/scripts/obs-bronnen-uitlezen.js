// Leest per tafel uit OBS welke bronnen er staan en met welke instellingen, en maakt daar een
// markdown-tabel van voor docs/obs-standaard.md (#98).
//
// ALLEEN LEZEN: dit script gebruikt uitsluitend GetSceneList / GetSceneItemList /
// GetInputSettings. Het zet, verandert of ververst niets in OBS en raakt een lopende stream
// dus niet — je kunt het gerust draaien terwijl er wordt uitgezonden.
//
// Gebruik (in PowerShell, op de OBS-pc, in de map agent/):
//   node scripts/obs-bronnen-uitlezen.js                       # tabel op het scherm
//   node scripts/obs-bronnen-uitlezen.js --uit obs-bronnen.md  # ook naar een bestand
//
// Leest dezelfde agent-config.json als de agent zelf (poorten per tafel), en de wachtwoorden uit
// dezelfde omgevingsvariabelen (OBS_PASSWORD_TAFEL_<nr>) — zet ze dus zoals bij het starten van
// de agent. Een andere config: $env:AGENT_CONFIG = 'pad\naar\agent-config.json'.
//
// Camerabronnen kunnen inloggegevens in hun URL hebben; die worden nooit getoond (zie
// src/obsBronnen.js). Controleer de uitvoer toch even voordat je hem in de repo zet.

const fs = require('node:fs');
const { OBSWebSocket } = require('obs-websocket-js');
const { loadConfig } = require('../src/config');
const { veiligeInstellingen, maakMarkdown } = require('../src/obsBronnen');

function arg(naam) {
  const i = process.argv.indexOf(`--${naam}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// Alle bronnen van één OBS-instantie, van boven naar onder in de programmascène.
async function leesTafel(cfg) {
  const obs = new OBSWebSocket();
  await obs.connect(`ws://${cfg.obs.host}:${cfg.obs.port}`, cfg.obs.password || undefined);
  try {
    const { currentProgramSceneName: scene } = await obs.call('GetCurrentProgramScene');
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: scene });

    // sceneItemIndex 0 = onderaan; wij tonen bovenaan eerst, zoals OBS zelf.
    const gesorteerd = [...sceneItems].sort((a, b) => b.sceneItemIndex - a.sceneItemIndex);

    const bronnen = [];
    for (const item of gesorteerd) {
      const naam = item.sourceName;
      const soort = item.inputKind || (item.isGroup ? 'group' : 'scene');
      let instellingen = {};
      if (item.inputKind) {
        try {
          const { inputSettings } = await obs.call('GetInputSettings', { inputName: naam });
          instellingen = veiligeInstellingen(item.inputKind, inputSettings);
        } catch (e) {
          instellingen = { fout: e.message };
        }
      }
      bronnen.push({
        naam,
        soort,
        zichtbaar: item.sceneItemEnabled,
        vergrendeld: item.sceneItemLocked,
        instellingen,
      });
    }
    return { tafel: cfg.tableNumber, scene, bronnen };
  } finally {
    await obs.disconnect().catch(() => {});
  }
}

(async () => {
  const config = loadConfig();
  const tafels = [];
  for (const cfg of config.tables) {
    try {
      tafels.push(await leesTafel(cfg));
      console.error(`tafel ${cfg.tableNumber}: uitgelezen`);
    } catch (e) {
      // Eén tafel die niet reageert (OBS uit, verkeerd wachtwoord) mag de rest niet tegenhouden.
      tafels.push({ tafel: cfg.tableNumber, fout: e.message });
      console.error(`tafel ${cfg.tableNumber}: MISLUKT — ${e.message}`);
    }
  }

  const md = maakMarkdown(tafels);
  console.log(md);
  const uit = arg('uit');
  if (uit) {
    fs.writeFileSync(uit, md, 'utf8');
    console.error(`geschreven: ${uit}`);
  }
  // Niet alles uitgelezen → niet-nul exitcode, zodat je het niet per ongeluk als "klaar" neemt.
  if (tafels.some((t) => t.fout)) process.exit(1);
})().catch((e) => {
  console.error(`Uitlezen mislukt: ${e.message}`);
  process.exit(1);
});
