const { loadConfig } = require('./src/config');
const { ObsPool } = require('./src/obs');
const backend = require('./src/backend');
const { startLoop } = require('./src/agent');

// Entrypoint van de agent. Draait als gewoon Node-proces; op de streaming-pc
// wordt dit als Windows-service opgestart (zie README). Alleen uitgaande HTTPS.
function main() {
  const config = loadConfig();
  const pool = new ObsPool(config.tables);
  console.log(
    `Mokum Streams-agent gestart — ${config.tables.length} tafel(s), poll elke ${config.pollIntervalMs}ms`
  );

  const timer = startLoop(config, pool, backend);

  const stop = async () => {
    clearInterval(timer);
    await pool.disconnectAll();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
