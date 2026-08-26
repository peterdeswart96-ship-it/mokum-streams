const { loadConfig } = require('./src/config');
const { ObsPool } = require('./src/obs');
const backend = require('./src/backend');
const { startLoop } = require('./src/agent');

// agent.log had geen tijdstippen — onmogelijk om een logregel te koppelen aan een
// moment in de backend-logs (Application Insights) of aan een actie die net vanuit het
// dashboard is gestuurd (geconstateerd 26-08 tijdens het uitzoeken van een niet-stoppende
// stream). Elke regel krijgt nu een ISO-tijdstip (UTC, zelfde tijdzone als de backend-logs).
function tijdgestempeldeLogger() {
  return { log: (...args) => console.log(`[${new Date().toISOString()}]`, ...args) };
}

// Entrypoint van de agent. Draait als gewoon Node-proces; op de streaming-pc
// wordt dit als Windows-service opgestart (zie README). Alleen uitgaande HTTPS.
function main() {
  const config = loadConfig();
  const pool = new ObsPool(config.tables);
  const logger = tijdgestempeldeLogger();
  logger.log(
    `Mokum Streams-agent gestart — ${config.tables.length} tafel(s), poll elke ${config.pollIntervalMs}ms`
  );

  const loop = startLoop(config, pool, backend, logger);

  const stop = async () => {
    loop.stop();
    await pool.disconnectAll();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
