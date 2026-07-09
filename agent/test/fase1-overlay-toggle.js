// Fase 1-test — bewijst dat de agent OBS kan aansturen.
// Verbindt met één OBS-instantie via obs-websocket en toggelt een overlay
// (standaard 'Sponsor slideshow') een paar keer aan/uit. Puur visueel; raakt
// de stream niet aan. Draai dit LOKAAL op de OBS-pc (127.0.0.1).
//
//   node fase1-overlay-toggle.js
//
// Het wachtwoord wordt interactief gevraagd (nooit in code/chat).
// Poort per tafel: 1=4455, 3=4456, 15=4457, 16=4458.

const { OBSWebSocket } = require('obs-websocket-js');
const readline = require('readline');

const HOST = 'ws://127.0.0.1:4455'; // Tafel 1
const SOURCE = 'Sponsor slideshow'; // te toggelen overlay
const ROUNDS = 3;                   // aantal keer aan/uit

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const vraag = (q) => new Promise((res) => rl.question(q, res));
const wacht = (ms) => new Promise((res) => setTimeout(res, ms));

// Zoekt de overlay in de huidige scène; valt terug op groepen als 'ie genest is.
async function vindItem(obs, sourceName) {
  const { currentProgramSceneName: scene } = await obs.call('GetCurrentProgramScene');
  try {
    const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName: scene, sourceName });
    return { sceneName: scene, sceneItemId };
  } catch (_) {
    // misschien zit de bron in een groep — doorzoek alle groepen in de scène
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: scene });
    for (const item of sceneItems) {
      if (item.isGroup) {
        const { sceneItems: groepItems } = await obs.call('GetGroupSceneItemList', { sceneName: item.sourceName });
        const treffer = groepItems.find((g) => g.sourceName === sourceName);
        if (treffer) return { sceneName: item.sourceName, sceneItemId: treffer.sceneItemId };
      }
    }
    throw new Error(`Bron '${sourceName}' niet gevonden in scène '${scene}' (ook niet in groepen).`);
  }
}

async function main() {
  const password = (await vraag('OBS-websocket wachtwoord (Tafel 1): ')).trim();
  rl.close();

  const obs = new OBSWebSocket();
  console.log(`Verbinden met ${HOST} ...`);
  const { obsWebSocketVersion } = await obs.connect(HOST, password);
  console.log(`Verbonden! obs-websocket v${obsWebSocketVersion}`);

  const { sceneName, sceneItemId } = await vindItem(obs, SOURCE);
  console.log(`Overlay '${SOURCE}' gevonden in scène '${sceneName}' (id ${sceneItemId}).`);

  for (let i = 1; i <= ROUNDS; i++) {
    await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: false });
    console.log(`Ronde ${i}/${ROUNDS}: UIT`);
    await wacht(1500);
    await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true });
    console.log(`Ronde ${i}/${ROUNDS}: AAN`);
    await wacht(1500);
  }

  await obs.disconnect();
  console.log('Klaar — verbinding netjes gesloten. ✅');
}

main().catch((err) => {
  console.error('FOUT:', err && err.message ? err.message : err);
  process.exit(1);
});
