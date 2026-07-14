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
