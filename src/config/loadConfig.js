const fs = require("fs");
const path = require("path");
const { createLogger } = require("../utils/logger");

const CONFIG_PATH = path.resolve(__dirname, "../../data/config.json");
const logger = createLogger("config");

const DEFAULT_CONFIG = {
  headless: true,
  thread: 2,
  browser_type: "chromium",
  api: {
    enabled: true,
    host: "0.0.0.0",
    port: 8000
  }
};

function mergeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    api: {
      ...DEFAULT_CONFIG.api,
      ...(config.api || {})
    }
  };
}

function loadConfigFromEnv() {
  return {
    headless: process.env.HEADLESS !== "false",
    thread: parseInt(process.env.THREAD || "2", 10),
    browser_type: process.env.BROWSER_TYPE || "chromium",
    api: {
      enabled: process.env.API_ENABLED !== "false",
      host: process.env.API_HOST || "0.0.0.0",
      port: parseInt(process.env.PORT || process.env.API_PORT || "8000", 10)
    }
  };
}

function loadConfig() {
  // Prioritas: Environment Variables > config.json > Default
  let config = { ...DEFAULT_CONFIG };

  // Load dari file jika tersedia
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    logger.success(`loaded ${CONFIG_PATH}`);
    config = mergeConfig(parsed);
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.warn("config file not found, using defaults");
    } else {
      logger.warn(`config invalid: ${error.message}`);
    }
  }

  // Override dengan environment variables
  const envConfig = loadConfigFromEnv();
  config = {
    ...config,
    ...envConfig,
    api: {
      ...config.api,
      ...envConfig.api
    }
  };

  return config;
}

module.exports = {
  loadConfig
};
