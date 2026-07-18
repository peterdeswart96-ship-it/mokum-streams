const { OBSWebSocket } = require('obs-websocket-js');
const { beoordeelCameraFrames } = require('./preflight');

// Beheert de obs-websocket-verbindingen naar de meerdere portable OBS-instanties
// (één per tafel, elk op een eigen poort + wachtwoord). Gebruikt de v5-requests:
//   StartStream / StopStream / GetStreamStatus / GetSceneItemId /
//   SetSceneItemEnabled / GetCurrentProgramScene.
// (Zie de obs-websocket protocol-reference in de wiki voor meer requests.)

class ObsPool {
  constructor(tables) {
    this.tables = new Map(tables.map((t) => [t.tableNumber, t]));
    this.conns = new Map();
    this._laatsteStart = new Map(); // tafel → tijdstip laatste StartStream (retry-guard, #41)
    this._camWatch = new Map(); // tafel → { laatstMs, bevrorenReeks } (freeze-watchdog, #43 A2)
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

  // Start OBS. Bij een stille OBS: gewoon starten (dat is de betrouwbare, bewezen weg —
  // OBS gaat van stil → zenden, en YouTube's auto-start zet de gekoppelde broadcast live).
  // Bij een OBS die ál zendt (bijv. een net her-gekoppelde nieuwe broadcast): forceer een
  // schone stil→zenden-flank (kort stoppen + opnieuw starten) zodat de auto-start óók dan
  // afvuurt — anders blijft de nieuwe broadcast op "Upcoming/No data" hangen (#41/#42).
  // Retry-guard: doen we dit NIET als we <35s geleden zelf startten, zodat een opnieuw-
  // afgeleverd startStream-commando (na een mislukte status-post) geen herstart-lus geeft.
  async startStream(tableNumber) {
    const obs = await this.connect(tableNumber);
    const { outputActive } = await obs.call('GetStreamStatus');
    if (outputActive) {
      const laatst = this._laatsteStart.get(tableNumber) || 0;
      if (Date.now() - laatst < 35000) return; // net zelf gestart → laten lopen (retry-guard)
      await obs.call('StopStream');
      await this._wachtTotGestopt(obs);
    }
    await obs.call('StartStream');
    this._laatsteStart.set(tableNumber, Date.now());
  }

  // Wacht (met timeout) tot OBS echt gestopt is en geeft YouTube daarna een korte buffer
  // om de stop te registreren — zodat de volgende StartStream een duidelijke flank vormt.
  async _wachtTotGestopt(obs, { timeoutMs = 6000, intervalMs = 200, bufferMs = 2000 } = {}) {
    const eind = Date.now() + timeoutMs;
    while (Date.now() < eind) {
      const { outputActive } = await obs.call('GetStreamStatus');
      if (!outputActive) break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    if (bufferMs) await new Promise((r) => setTimeout(r, bufferMs));
  }

  // Pre-flight (#43): geeft de camerabron van deze tafel LIVE beeld? Maakt twee kleine
  // schermafbeeldingen met een korte tussenpoos en vergelijkt ze (zie
  // preflight.beoordeelCameraFrames). Bedoeld als vangnet vóór een AUTOMATISCHE start:
  // een bevroren/dode camera (storing 15-07) mag niet onbewaakt de lucht in.
  //
  // Gooit alleen bij een OBS-verbindingsfout (die hoort de caller als transiënt te
  // behandelen → later opnieuw). Een ontbrekende bron of mislukte screenshot komt als
  // { live:false } terug — dat blokkeert de start bewust.
  async cameraLevendig(tableNumber, cameraSource, { gapMs = 600, breedte = 480, hoogte = 270, format = 'jpg' } = {}) {
    const obs = await this.connect(tableNumber);
    const schiet = async () => {
      try {
        const { imageData } = await obs.call('GetSourceScreenshot', {
          sourceName: cameraSource,
          imageFormat: format,
          imageWidth: breedte,
          imageHeight: hoogte,
        });
        return imageData;
      } catch {
        return null; // bron bestaat niet / niet te screenshotten → geen beeld
      }
    };
    const a = await schiet();
    await new Promise((r) => setTimeout(r, gapMs));
    const b = await schiet();
    return beoordeelCameraFrames(a, b);
  }

  // Forceer een herlading van de camerabron — het equivalent van handmatig
  // "Properties → OK", wat de bevriezing van 15-07 verhielp (#43, blok A2).
  // Eerst de media-herstart (RTSP opnieuw verbinden); lukt dat niet (geen media-input),
  // dan de instellingen opnieuw toepassen (dat triggert net als OK een source-update).
  async herstelCamera(tableNumber, cameraSource) {
    const obs = await this.connect(tableNumber);
    try {
      await obs.call('TriggerMediaInputAction', {
        inputName: cameraSource,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      });
    } catch {
      const { inputSettings } = await obs.call('GetInputSettings', { inputName: cameraSource });
      await obs.call('SetInputSettings', { inputName: cameraSource, inputSettings, overlay: true });
    }
  }

  // Freeze-watchdog (#43, blok A2): controleert periodiek of de camera nog live beeld
  // geeft en herstelt 'm bij een bevriezing. Bedoeld om PER TICK aangeroepen te worden;
  // throttelt zelf (intervalMs) en debounced (herstelNa opeenvolgende bevriezingen) zodat
  // een eenmalige fluke geen onnodige herlading (= korte hapering) veroorzaakt.
  // Retour-status: 'skip' (nog niet aan de beurt) | 'ok' | 'verdacht' | 'hersteld' |
  // 'herstel-mislukt'. De throttle-/debounce-stand leeft in de pool (blijft tussen ticks).
  async cameraWatchdog(tableNumber, cameraSource, nowMs = Date.now(), { intervalMs = 30000, herstelNa = 2 } = {}) {
    const st = this._camWatch.get(tableNumber) || { laatstMs: 0, bevrorenReeks: 0 };
    if (nowMs - st.laatstMs < intervalMs) return { status: 'skip' };
    st.laatstMs = nowMs;

    const check = await this.cameraLevendig(tableNumber, cameraSource);
    if (check.live) {
      st.bevrorenReeks = 0;
      this._camWatch.set(tableNumber, st);
      return { status: 'ok' };
    }
    st.bevrorenReeks += 1;
    if (st.bevrorenReeks < herstelNa) {
      this._camWatch.set(tableNumber, st);
      return { status: 'verdacht', reden: check.reden, reeks: st.bevrorenReeks };
    }
    try {
      await this.herstelCamera(tableNumber, cameraSource);
      st.bevrorenReeks = 0; // na een herstelpoging opnieuw beginnen met tellen
      this._camWatch.set(tableNumber, st);
      return { status: 'hersteld', reden: check.reden };
    } catch (e) {
      this._camWatch.set(tableNumber, st);
      return { status: 'herstel-mislukt', reden: e.message };
    }
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
      const err = new Error(`bron '${sourceName}' niet gevonden in scène '${sceneName}'`);
      err.code = 'SOURCE_NOT_FOUND'; // permanente fout → agent dropt i.p.v. eeuwig herproberen
      throw err;
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
