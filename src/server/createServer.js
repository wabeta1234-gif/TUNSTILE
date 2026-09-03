const express = require("express");

function createServer({ config, solver }) {
  const app = express();
  const ensureSolver = (res) => {
    if (solver) {
      return true;
    }

    res.status(503).json({ detail: "solver not ready" });
    return false;
  };

  const runSolve = async (payload, res) => {
    try {
      const result = await solver.solve(
        payload.url,
        payload.sitekey,
        payload.action,
        payload.cdata
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  };

  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      name: "cloudflare turnstile solver api",
      version: "1.0.0",
      config,
      endpoints: {
        "/": "api info",
        "/status": "solver status",
        "/api/solve": "solve turnstile",
        "/health": "health check"
      }
    });
  });

  app.get("/status", (_req, res) => {
    if (!ensureSolver(res)) {
      return;
    }

    res.json(solver.getStatus());
  });

  app.get("/api/solve", async (req, res) => {
    if (!ensureSolver(res)) {
      return;
    }

    await runSolve(req.query, res);
  });

  app.post("/api/solve", async (req, res) => {
    if (!ensureSolver(res)) {
      return;
    }

    await runSolve(req.body, res);
  });

  app.get("/health", (_req, res) => {
    if (!solver) {
      res.json({ status: "down", message: "solver not ready" });
      return;
    }

    const status = solver.getStatus();
    if (status.initialized) {
      res.json({ status: "up", pool_size: status.pool_size });
      return;
    }

    res.json({ status: "down", message: "pool empty" });
  });

  return app;
}

module.exports = {
  createServer
};
