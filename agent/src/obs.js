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

  async startStream(tableNumber) {
    const obs = await this.connect(tableNumber);
    await obs.call('StartStream');
  }

  async stopStream(tableNumber) {
    const obs = await this.connect(tableNumber);
    await obs.call('StopStream');
  }

  // Zet een overlay/scoreboard-bron (op naam) aan of uit in de tafel-scène.
  async setOverlay(tableNumber, sourceName, enabled) {
    const cfg = this.tables.get(tableNumber);
    const obs = await this.connect(tableNumber);
    const sceneName = cfg.sceneName || (await obs.call('GetCurrentProgramScene')).currentProgramSceneName;
    const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName });
    await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: enabled });
  }

  // Leest de streamstatus; berekent een gemiddelde bitrate uit outputBytes/duration.
  async status(tableNumber) {
    const obs = await this.connect(tableNumber);
    const s = await obs.call('GetStreamStatus');
    const bitrateKbps =
      s.outputActive && s.outputDuration > 0 ? Math.round((s.outputBytes * 8) / s.outputDuration) : 0;
    return { obsConnected: true, streaming: !!s.outputActive, bitrateKbps };
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
