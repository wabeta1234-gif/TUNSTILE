const { loadConfig } = require("./config/loadConfig");
const { createServer } = require("./server/createServer");
const { TurnstileSolver } = require("./solver/TurnstileSolver");
const { createLogger } = require("./utils/logger");

const config = loadConfig();
const logger = createLogger("app");
let solver;
let server;

function showConfig() {
  logger.info("using config");
  console.log(JSON.stringify({
    headless: config.headless,
    thread: config.thread,
    browser_type: config.browser_type,
    api: {
      enabled: config.api.enabled,
      host: config.api.host,
      port: config.api.port
    }
  }, null, 2));
}

async function closeServer() {
  if (server) {
    return new Promise((resolve) => {
      server.close(() => {
        logger.info("server closed");
        resolve();
      });
    });
  }
}

async function shutdown(code) {
  logger.info("shutting down...");
  await closeServer();
  if (solver) {
    await solver.cleanup();
  }

  process.exit(code);
}

async function main() {
  showConfig();

  solver = new TurnstileSolver({
    headless: config.headless,
    thread: config.thread,
    browser_type: config.browser_type
  });

  await solver.initialize();

  if (config.api.enabled) {
    const serverApp = createServer({ config, solver });
    
    await new Promise((resolve) => {
      server = serverApp.listen(config.api.port, config.api.host, () => {
        logger.success(`api ready on ${config.api.host}:${config.api.port}`);
        resolve();
      });
    });
    return;
  }

  logger.info("cli mode tidak tersedia dalam production");
  await new Promise(() => {});
}

process.on("SIGINT", async () => {
  await shutdown(0);
});

process.on("SIGTERM", async () => {
  await shutdown(0);
});

main().catch(async (error) => {
  logger.error(`fatal: ${error.message}`);
  await shutdown(1);
});
