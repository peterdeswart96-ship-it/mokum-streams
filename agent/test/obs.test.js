const test = require('node:test');
const assert = require('node:assert');
const { ObsPool } = require('../src/obs');

// Fake OBS-verbinding: logt de requests en beantwoordt GetStreamStatus met een
// (reeks) outputActive-waarde(n). Zo testen we de startStream-logica zonder websocket.
function fakeObs(outputActive) {
  const calls = [];
  let i = 0;
  return {
    calls,
    async call(req) {
      calls.push(req);
      if (req === 'GetStreamStatus') {
        const v = Array.isArray(outputActive) ? outputActive[Math.min(i++, outputActive.length - 1)] : outputActive;
        return { outputActive: v };
      }
      return {};
    },
  };
}

function poolMet(obs) {
  const pool = new ObsPool([{ tableNumber: 1, obs: { host: 'x', port: 1 } }]);
  pool.connect = async () => obs;          // geen echte websocket
  pool._wachtTotGestopt = async () => {};  // geen 2s-buffer in de test
  return pool;
}

test('startStream: stille OBS → gewoon StartStream (geen stop)', async () => {
  const obs = fakeObs(false);
  await poolMet(obs).startStream(1);
  assert.deepStrictEqual(obs.calls, ['GetStreamStatus', 'StartStream']);
});

test('startStream: al aan het zenden + net zelf gestart → niets doen (retry-guard)', async () => {
  const obs = fakeObs(true);
  const pool = poolMet(obs);
  pool._laatsteStart.set(1, Date.now()); // <35s geleden
  await pool.startStream(1);
  assert.deepStrictEqual(obs.calls, ['GetStreamStatus']); // geen Stop/Start
});

test('startStream: al aan het zenden + lang geleden gestart → schone flank (Stop → Start)', async () => {
  const obs = fakeObs(true);
  const pool = poolMet(obs);
  pool._laatsteStart.set(1, Date.now() - 60000); // >35s geleden
  await pool.startStream(1);
  assert.deepStrictEqual(obs.calls, ['GetStreamStatus', 'StopStream', 'StartStream']);
});

// --- Freeze-watchdog + camera-herstel (#43 A2) ---

// Rijkere fake: reageert op (req, params) en kan per request een handler draaien.
function fakeObs2(handlers = {}) {
  const calls = [];
  return {
    calls,
    async call(req, params) {
      calls.push([req, params]);
      if (handlers[req]) return handlers[req](params);
      return {};
    },
  };
}

test('herstelCamera: media-input → TriggerMediaInputAction RESTART', async () => {
  const obs = fakeObs2();
  const pool = poolMet(obs);
  await pool.herstelCamera(1, 'Camera Tafel 1');
  assert.deepStrictEqual(obs.calls[0], [
    'TriggerMediaInputAction',
    { inputName: 'Camera Tafel 1', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' },
  ]);
});

test('herstelCamera: geen media-input → valt terug op instellingen opnieuw toepassen', async () => {
  const obs = fakeObs2({
    TriggerMediaInputAction() { throw new Error('geen media-input'); },
    GetInputSettings() { return { inputSettings: { input: 'rtsp://x' } }; },
  });
  const pool = poolMet(obs);
  await pool.herstelCamera(1, 'Camera Tafel 1');
  const namen = obs.calls.map((c) => c[0]);
  assert.deepStrictEqual(namen, ['TriggerMediaInputAction', 'GetInputSettings', 'SetInputSettings']);
  assert.deepStrictEqual(obs.calls[2][1], { inputName: 'Camera Tafel 1', inputSettings: { input: 'rtsp://x' }, overlay: true });
});

// Camerabeeld simuleren: teller die elke screenshot een ander/gelijk frame teruggeeft.
function watchdogPool(frames) {
  const pool = new ObsPool([{ tableNumber: 1, obs: { host: 'x', port: 1 } }]);
  let i = 0;
  const obs = {
    async call(req) {
      if (req === 'GetSourceScreenshot') return { imageData: frames[Math.min(i++, frames.length - 1)] };
      return {};
    },
  };
  pool.connect = async () => obs;
  const hersteld = [];
  pool.herstelCamera = async (t) => { hersteld.push(t); };
  pool._hersteld = hersteld;
  return pool;
}

const beeldje = (s) => 'data:image/jpg;base64,' + s.repeat(40);

test('cameraWatchdog: throttle — binnen intervalMs → skip, geen screenshots', async () => {
  const pool = watchdogPool([beeldje('a'), beeldje('b')]);
  pool._camWatch.set(1, { laatstMs: 1000, bevrorenReeks: 0 });
  const r = await pool.cameraWatchdog(1, 'Camera Tafel 1', 1500, { intervalMs: 30000 });
  assert.strictEqual(r.status, 'skip');
});

test('cameraWatchdog: live camera (verschillende frames) → ok, geen herstel', async () => {
  const pool = watchdogPool([beeldje('a'), beeldje('b')]);
  const r = await pool.cameraWatchdog(1, 'Camera Tafel 1', 100000, { intervalMs: 30000, herstelNa: 2 });
  assert.strictEqual(r.status, 'ok');
  assert.deepStrictEqual(pool._hersteld, []);
});

test('cameraWatchdog: bevroren → eerst "verdacht" (debounce), pas na herstelNa echt herstellen', async () => {
  const pool = watchdogPool([beeldje('z'), beeldje('z'), beeldje('z'), beeldje('z')]); // altijd identiek
  const r1 = await pool.cameraWatchdog(1, 'Camera Tafel 1', 100000, { intervalMs: 30000, herstelNa: 2 });
  assert.strictEqual(r1.status, 'verdacht');
  assert.deepStrictEqual(pool._hersteld, []); // nog niet herstellen bij één keer
  const r2 = await pool.cameraWatchdog(1, 'Camera Tafel 1', 200000, { intervalMs: 30000, herstelNa: 2 });
  assert.strictEqual(r2.status, 'hersteld');
  assert.deepStrictEqual(pool._hersteld, [1]); // tweede keer → herstart
});
