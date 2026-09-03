const { chromium } = require("playwright");
const { getRandomUserAgent } = require("../utils/userAgents");
const { createLogger } = require("../utils/logger");

class BrowserPool {
  constructor() {
    this.available = [];
    this.waiters = [];
  }

  async acquire() {
    if (this.available.length > 0) {
      return this.available.shift();
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(item) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }

    this.available.push(item);
  }

  size() {
    return this.available.length;
  }
}

function createPoolEntry(index, browser) {
  return { index, browser };
}

class TurnstileSolver {
  static HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>turnstile solver</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f0f0f0;
      font-family: Arial, sans-serif;
    }
    .container {
      text-align: center;
      padding: 30px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .turnstile-container {
      margin: 20px 0;
      display: inline-block;
    }
    #status {
      margin-top: 20px;
      padding: 10px;
      background: #f8f8f8;
      border-radius: 5px;
      font-size: 14px;
      color: #333;
    }
  </style>
  <script>
    function updateStatus(message, type) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.style.color = type === 'error' ? '#d32f2f' :
        type === 'success' ? '#388e3c' : '#1976d2';
    }

    function checkToken() {
      const tokenInput = document.querySelector('[name="cf-turnstile-response"]');
      if (tokenInput && tokenInput.value) {
        updateStatus('token ready (' + tokenInput.value.length + ' chars)', 'success');
      }
    }

    window.onload = function () {
      setInterval(checkToken, 500);
      updateStatus('turnstile loading...');
    };
  </script>
</head>
<body>
  <div class="container">
    <h2>cloudflare turnstile test</h2>
    <div class="turnstile-container">
      <!-- TURNSTILE_WIDGET -->
    </div>
    <div id="status">initializing...</div>
  </div>
</body>
</html>`;

  constructor(options = {}) {
    this.headless = options.headless ?? true;
    this.threadCount = options.thread ?? 2;
    this.browserType = options.browser_type ?? "chromium";
    this.userAgent = options.useragent || getRandomUserAgent();
    this.logger = createLogger("solver");
    this.browserPool = new BrowserPool();
    this.browsers = [];
    this.browserArgs = [
      `--user-agent=${this.userAgent}`,
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process"
    ];
  }

  hasDisplay() {
    return Boolean(process.env.DISPLAY);
  }

  async initialize() {
    if (!["chromium", "chrome", "msedge"].includes(this.browserType)) {
      throw new Error(`unsupported browser type: ${this.browserType}`);
    }

    this.logger.info(`starting ${this.threadCount} browser instance(s)`);

    for (let index = 0; index < this.threadCount; index += 1) {
      const browser = await this.createBrowser(index + 1);
      const entry = createPoolEntry(index + 1, browser);
      this.browsers.push(entry);
      this.browserPool.release(entry);
      this.logger.success(`browser ${index + 1}/${this.threadCount} ready`);
    }
  }

  async createBrowser(index) {
    try {
      const channel = this.browserType === "chromium" ? undefined : this.browserType;
      return await chromium.launch({
        channel,
        headless: this.headless,
        args: this.browserArgs
      });
    } catch (error) {
      this.logger.warn(`browser ${index} failed, retry safe mode`);
      return chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"]
      });
    }
  }

  async isBrowserAlive(browser) {
    try {
      await browser.version();
      return true;
    } catch {
      return false;
    }
  }

  async refreshBrowser(pooled) {
    try {
      await pooled.browser.close();
    } catch {}

    pooled.browser = await this.createBrowser(pooled.index);
    this.logger.success(`browser ${pooled.index} respawned`);
    return pooled;
  }

  async acquireBrowser() {
    const pooled = await this.browserPool.acquire();
    const alive = await this.isBrowserAlive(pooled.browser);

    if (alive) {
      return pooled;
    }

    this.logger.warn(`browser ${pooled.index} disconnected, recreate`);
    return this.refreshBrowser(pooled);
  }

  async setupContext(browser) {
    return browser.newContext({
      userAgent: this.userAgent
    });
  }

  buildWidgetAttributes(sitekey, action, cdata) {
    const attrs = [`class="cf-turnstile"`, `data-sitekey="${sitekey}"`];

    if (action) {
      attrs.push(`data-action="${action}"`);
    }

    if (cdata) {
      attrs.push(`data-cdata="${cdata}"`);
    }

    attrs.push(`style="transform: scale(1.2);"`);
    return attrs.join(" ");
  }

  buildPageHtml(sitekey, action, cdata) {
    return TurnstileSolver.HTML_TEMPLATE.replace(
      "<!-- TURNSTILE_WIDGET -->",
      `<div ${this.buildWidgetAttributes(sitekey, action, cdata)}></div>`
    );
  }

  async readToken(page) {
    return page.evaluate(() => {
      const input = document.querySelector('[name="cf-turnstile-response"]');
      return input ? input.value : null;
    });
  }

  async clickWidget(page) {
    const iframe = page.locator("iframe[title*='cloudflare']");
    if ((await iframe.count()) > 0) {
      await iframe.click({ timeout: 2000 });
      return;
    }

    await page.click(".cf-turnstile", { timeout: 2000 });
  }

  async solve(url, sitekey, action, cdata) {
    if (!url || !sitekey) {
      return {
        status: "error",
        error: "url and sitekey are required"
      };
    }

    const startedAt = Date.now();
    const pooled = await this.acquireBrowser();

    try {
      const context = await this.setupContext(pooled.browser);
      const page = await context.newPage();
      const result = await this.solveOnPage(page, url, sitekey, action, cdata, startedAt);
      await context.close();
      this.browserPool.release(pooled);
      return result;
    } catch (error) {
      const alive = await this.isBrowserAlive(pooled.browser);
      if (!alive) {
        await this.refreshBrowser(pooled);
      }
      this.browserPool.release(pooled);
      return {
        status: "error",
        error: error.message,
        time: Number(((Date.now() - startedAt) / 1000).toFixed(3))
      };
    }
  }

  async solveOnPage(page, url, sitekey, action, cdata, startedAt) {
    const normalizedUrl = url.endsWith("/") ? url : `${url}/`;
    const pageData = this.buildPageHtml(sitekey, action, cdata);

    await page.route(normalizedUrl, async (route) => {
      await route.fulfill({
        status: 200,
        body: pageData,
        contentType: "text/html"
      });
    });

    await page.goto(normalizedUrl);

    try {
      await page.waitForSelector(".cf-turnstile", { timeout: 10000 });
    } catch {
      throw new Error("turnstile did not load");
    }

    await page.waitForTimeout(2000);

    try {
      await this.clickWidget(page);
    } catch {
      this.logger.warn("direct click failed, fallback js click");
      await page.evaluate(() => {
        const turnstile = document.querySelector(".cf-turnstile");
        if (turnstile) {
          turnstile.click();
        }
      });
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const token = await this.readToken(page);

      if (token && token.trim()) {
        const elapsed = Number(((Date.now() - startedAt) / 1000).toFixed(3));
        this.logger.success(`solved in ${elapsed}s`);
        return {
          status: "success",
          token,
          time: elapsed
        };
      }

      await page.waitForTimeout(1000);

      if (attempt % 5 === 0) {
        try {
          await page.click(".cf-turnstile", { timeout: 1000 });
        } catch {}
      }
    }

    throw new Error("could not get token after 30 tries");
  }

  async cleanup() {
    for (const pooled of this.browsers) {
      try {
        await pooled.browser.close();
      } catch {}
    }

    this.browsers = [];
  }

  getStatus() {
    return {
      initialized: this.browserPool.size() > 0,
      thread_count: this.threadCount,
      browser_type: this.browserType,
      headless: this.headless,
      has_display: this.hasDisplay(),
      user_agent: this.userAgent.length > 50 ? `${this.userAgent.slice(0, 50)}...` : this.userAgent,
      pool_size: this.browserPool.size()
    };
  }
}

module.exports = {
  TurnstileSolver
};
