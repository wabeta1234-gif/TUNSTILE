const fs = require("fs");
const path = require("path");

const USER_AGENTS_PATH = path.resolve(__dirname, "../../data/user-agents.txt");

const FALLBACK_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getRandomUserAgent() {
  try {
    if (!fs.existsSync(USER_AGENTS_PATH)) {
      return pickRandom(FALLBACK_USER_AGENTS);
    }

    const userAgents = fs
      .readFileSync(USER_AGENTS_PATH, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    return pickRandom(userAgents.length ? userAgents : FALLBACK_USER_AGENTS);
  } catch {
    return pickRandom(FALLBACK_USER_AGENTS);
  }
}

module.exports = {
  getRandomUserAgent
};
