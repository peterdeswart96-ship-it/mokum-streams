const { OBSWebSocket } = require('obs-websocket-js');

// Beheert de obs-websocket-verbindingen naar de meerdere portable OBS-instanties
// (één per tafel, elk op een eigen poort + wachtwoord). Gebruikt de v5-requests:
//   StartStream / StopStream / GetStreamStatus / GetSceneItemId /
//   SetSceneItemEnabled / GetCurrentProgramScene.
// (Zie de obs-websocket protocol-reference in de wiki voor meer requests.)

class ObsPool {
  constructor(tables) {
    this.tables = new Map(tables.map((t) => [t.tableNumber, t]));
    this.conns = new Map();
  }

  // Verbindt (lazy) met de OBS-instantie van een tafel en cachet de verbinding.
  async connect(tableNumber) {
    const cfg = this.tables.get(tableNumber);
    if (!cfg) throw new Error(`onbekende tafel ${tableNumber}`);
    const bestaand = this.conns.get(tableNumber);
    if (bestaand) return bestaand;
    const obs = new OBSWebSocket();
    const url = `ws://${cfg.obs.host}:${cfg.obs.port}`;
    await obs.connect(url, cfg.obs.password || undefined);
    obs.on('ConnectionClosed', () => this.conns.delete(tableNumber));
    this.conns.set(tableNumber, obs);
    return obs;
  }

  // Idempotent: alleen starten als 'ie nog niet streamt (voorkomt fouten +
  // hangende commando's als de stream al liep).
  async startStream(tableNumber) {
    const obs = await this.connect(tableNumber);
    const { outputActive } = await obs.call('GetStreamStatus');
    if (!outputActive) await obs.call('StartStream');
  }

  // Idempotent: alleen stoppen als 'ie daadwerkelijk streamt.
  async stopStream(tableNumber) {
    const obs = await this.connect(tableNumber);
    const { outputActive } = await obs.call('GetStreamStatus');
    if (outputActive) await obs.call('StopStream');
  }

  // Zoekt een bron in de scène; valt terug op groepen als 'ie genest is
  // (bijv. 'Sponsor slideshow' in de 'Sponsors'-groep).
  async _vindSceneItem(obs, sceneName, sourceName) {
    try {
      const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName });
      return { sceneName, sceneItemId };
    } catch (_) {
      const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
      for (const item of sceneItems) {
        if (item.isGroup) {
          const { sceneItems: groep } = await obs.call('GetGroupSceneItemList', { sceneName: item.sourceName });
          const treffer = groep.find((g) => g.sourceName === sourceName);
          if (treffer) return { sceneName: item.sourceName, sceneItemId: treffer.sceneItemId };
        }
      }
      throw new Error(`bron '${sourceName}' niet gevonden in scène '${sceneName}'`);
    }
  }

  // Zet een overlay/scoreboard-bron (op naam) aan of uit in de tafel-scène.
  async setOverlay(tableNumber, sourceName, enabled) {
    const cfg = this.tables.get(tableNumber);
    const obs = await this.connect(tableNumber);
    const scene = cfg.sceneName || (await obs.call('GetCurrentProgramScene')).currentProgramSceneName;
    const { sceneName, sceneItemId } = await this._vindSceneItem(obs, scene, sourceName);
    await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: enabled });
  }

  // Leest de streamstatus; berekent een gemiddelde bitrate uit outputBytes/duration
  // (outputDuration in ms → bits/ms == kbps) en de output-resolutie + fps.
  async status(tableNumber) {
    const obs = await this.connect(tableNumber);
    const s = await obs.call('GetStreamStatus');
    const bitrateKbps =
      s.outputActive && s.outputDuration > 0 ? Math.round((s.outputBytes * 8) / s.outputDuration) : 0;
    let resolution = null;
    let fps = null;
    try {
      const v = await obs.call('GetVideoSettings');
      resolution = `${v.outputWidth}x${v.outputHeight}`;
      if (v.fpsDenominator) fps = Math.round(v.fpsNumerator / v.fpsDenominator);
    } catch {
      /* oudere OBS zonder GetVideoSettings → laat resolutie/fps op null */
    }
    return { obsConnected: true, streaming: !!s.outputActive, bitrateKbps, resolution, fps };
  }

  // Leest de werkelijke aan/uit-stand van de opgegeven overlaybronnen (map
  // sleutel→bronnaam) via GetSceneItemEnabled. Een bron die niet bestaat wordt
  // stil overgeslagen (blijft uit de map).
  async overlayStates(tableNumber, sources) {
    const cfg = this.tables.get(tableNumber);
    const obs = await this.connect(tableNumber);
    const scene = cfg.sceneName || (await obs.call('GetCurrentProgramScene')).currentProgramSceneName;
    const out = {};
    for (const [sleutel, sourceName] of Object.entries(sources || {})) {
      try {
        const { sceneName, sceneItemId } = await this._vindSceneItem(obs, scene, sourceName);
        const { sceneItemEnabled } = await obs.call('GetSceneItemEnabled', { sceneName, sceneItemId });
        out[sleutel] = !!sceneItemEnabled;
      } catch {
        /* bron niet gevonden → laat weg */
      }
    }
    return out;
  }

  async disconnectAll() {
    for (const obs of this.conns.values()) {
      try {
        await obs.disconnect();
      } catch {
        /* negeren */
      }
    }
    this.conns.clear();
  }
}

module.exports = { ObsPool };
