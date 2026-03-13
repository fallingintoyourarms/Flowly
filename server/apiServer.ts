import express from "express";
import cors from "cors";
import type { CapturedRequest } from "../types/capturedRequest.js";
import { memoryStore } from "../storage/memoryStore.js";
import type { SqliteStore } from "../storage/sqliteStore.js";

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface ApiServerOptions {
  port: number;
  sqlite?: SqliteStore;
  getCurrentSessionId?: () => string;
  setCurrentSessionTags?: (tags: string[]) => void;
  getCurrentSessionTags?: () => string[];
}

async function sendTestRequest(): Promise<{ ok: boolean; error?: string }> {
  try {
    await fetch("http://127.0.0.1:9090/flowly/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "dev-test-key"
      },
      body: JSON.stringify({ source: "flowly-api", ts: Date.now() })
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to reach Flowly proxy on http://127.0.0.1:9090" };
  }
}

/**
 * Internal API used by the dashboard UI.
 */
export function startApiServer(opts: ApiServerOptions) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/analytics/overview", (req, res) => {
    const windowSecRaw = typeof req.query.windowSec === "string" ? Number(req.query.windowSec) : 30;
    const windowSec = Number.isFinite(windowSecRaw) ? Math.max(5, Math.min(300, windowSecRaw)) : 30;
    const windowMs = windowSec * 1000;

    const now = Date.now();
    const items = memoryStore.all();
    const recent = items.filter((r) => now - r.timestamp <= windowMs);

    const total = recent.length;
    const rps = windowSec > 0 ? total / windowSec : 0;

    let sum = 0;
    let n = 0;
    for (const r of recent) {
      if (typeof r.duration === "number" && Number.isFinite(r.duration)) {
        sum += r.duration;
        n += 1;
      }
    }
    const avgResponseMs = n > 0 ? sum / n : null;

    const statusCounts: Record<string, number> = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 };
    for (const r of recent) {
      const s = r.responseStatus;
      if (typeof s !== "number") continue;
      if (s >= 200 && s < 300) statusCounts["2xx"]++;
      else if (s >= 300 && s < 400) statusCounts["3xx"]++;
      else if (s >= 400 && s < 500) statusCounts["4xx"]++;
      else if (s >= 500 && s < 600) statusCounts["5xx"]++;
      else statusCounts.other++;
    }

    const buckets = [0, 25, 50, 100, 200, 400, 800, 1600];
    const histogram = buckets.map((b, i) => {
      const next = i === buckets.length - 1 ? Infinity : buckets[i + 1];
      return { min: b, max: next, count: 0 };
    });

    for (const r of recent) {
      const d = r.duration;
      if (typeof d !== "number" || !Number.isFinite(d)) continue;
      for (const bucket of histogram) {
        if (d >= bucket.min && d < bucket.max) {
          bucket.count++;
          break;
        }
      }
    }

    res.json({
      ok: true,
      windowSec,
      total,
      rps,
      avgResponseMs,
      statusCounts,
      latencyHistogram: histogram
    });
  });

  app.get("/requests", (_req, res) => {
    res.json(memoryStore.all());
  });

  app.get("/requests/history", (req, res) => {
    if (!opts.sqlite) return res.status(501).json({ error: "SQLite persistence not configured" });

    const method = typeof req.query.method === "string" ? req.query.method.toUpperCase() : undefined;
    const statusMin = typeof req.query.statusMin === "string" ? Number(req.query.statusMin) : undefined;
    const statusMax = typeof req.query.statusMax === "string" ? Number(req.query.statusMax) : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const regex = typeof req.query.regex === "string" ? req.query.regex : undefined;
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    const since = typeof req.query.since === "string" ? Number(req.query.since) : undefined;
    const until = typeof req.query.until === "string" ? Number(req.query.until) : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const offsetRaw = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;

    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, limitRaw!)) : 500;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw!) : 0;

    if (regex && regex.length > 200) return res.status(400).json({ error: "regex too long" });
    if (regex) {
      try {
        // validation only
        new RegExp(regex, "i");
      } catch {
        return res.status(400).json({ error: "invalid regex" });
      }
    }

    const items = opts.sqlite.queryRequests({ method, statusMin, statusMax, q, regex, sessionId, tag, since, until, limit, offset });
    res.json({ ok: true, count: items.length, items });
  });

  app.get("/requests/query", (req, res) => {
    const method = typeof req.query.method === "string" ? req.query.method.toUpperCase() : undefined;
    const statusMin = typeof req.query.statusMin === "string" ? Number(req.query.statusMin) : undefined;
    const statusMax = typeof req.query.statusMax === "string" ? Number(req.query.statusMax) : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const regex = typeof req.query.regex === "string" ? req.query.regex : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(2000, limit!)) : 500;

    let re: RegExp | undefined;
    if (regex) {
      if (regex.length > 200) return res.status(400).json({ error: "regex too long" });
      try {
        re = new RegExp(regex, "i");
      } catch {
        return res.status(400).json({ error: "invalid regex" });
      }
    }

    const needle = q?.toLowerCase();

    const out = memoryStore
      .all()
      .filter((r) => {
        if (method && r.method.toUpperCase() !== method) return false;

        const s = r.responseStatus;
        if (typeof statusMin === "number" && Number.isFinite(statusMin) && typeof s === "number" && s < statusMin) return false;
        if (typeof statusMax === "number" && Number.isFinite(statusMax) && typeof s === "number" && s > statusMax) return false;

        if (needle) {
          const hay = `${r.path}\n${r.body ?? ""}\n${r.responseBody ?? ""}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }

        if (re) {
          const hay = `${r.path}\n${r.body ?? ""}\n${r.responseBody ?? ""}`;
          if (!re.test(hay)) return false;
        }

        return true;
      })
      .slice(0, safeLimit);

    res.json({ ok: true, count: out.length, items: out });
  });

  app.get("/events", (req, res) => {
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");

    (res as any).flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send("hello", { ok: true });

    const unsubscribe = memoryStore.subscribe((evt) => {
      send(evt.type, evt);
    });

    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  });

  app.get("/export", (_req, res) => {
    res.json(memoryStore.all());
  });

  app.get("/export.json", (_req, res) => {
    res.json(memoryStore.all());
  });

  app.get("/export.csv", (_req, res) => {
    const items = memoryStore.all();
    const columns: Array<keyof CapturedRequest | "requestHeaders" | "responseHeaders"> = [
      "id",
      "timestamp",
      "method",
      "path",
      "targetUrl",
      "responseStatus",
      "duration",
      "isWebSocket",
      "requestHeaders",
      "body",
      "responseHeaders",
      "responseBody"
    ];

    const header = columns.join(",");
    const lines = [header];

    for (const r of items) {
      const row = columns
        .map((col) => {
          if (col === "requestHeaders") return csvEscape(JSON.stringify(r.rawHeaders ?? r.headers ?? {}));
          if (col === "responseHeaders") return csvEscape(JSON.stringify(r.rawResponseHeaders ?? r.responseHeaders ?? {}));
          return csvEscape((r as any)[col]);
        })
        .join(",");
      lines.push(row);
    }

    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", "attachment; filename=flowly-export.csv");
    res.send(lines.join("\n"));
  });

  app.post("/import.json", (req, res) => {
    const body = req.body;
    if (!Array.isArray(body)) return res.status(400).json({ error: "Expected an array" });
    memoryStore.replaceAll(body as CapturedRequest[]);
    res.json({ ok: true, count: body.length });
  });

  app.post("/import", (req, res) => {
    const body = req.body;
    if (!Array.isArray(body)) return res.status(400).json({ error: "Expected an array" });
    memoryStore.replaceAll(body as CapturedRequest[]);
    res.json({ ok: true, count: body.length });
  });

  app.get("/requests/:id", (req, res) => {
    const item = memoryStore.get(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });

  app.post("/pause", (req, res) => {
    const paused = Boolean(req.body?.paused);
    memoryStore.setPaused(paused);
    res.json({ paused: memoryStore.isPaused() });
  });

  app.post("/clear", (_req, res) => {
    memoryStore.clear();
    res.json({ ok: true });
  });

  app.post("/sessions/start", (req, res) => {
    if (!opts.sqlite) return res.status(501).json({ error: "SQLite persistence not configured" });
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t: any) => String(t)).filter(Boolean) : [];
    const id = crypto.randomUUID();
    opts.sqlite.ensureSession(id, tags);
    res.json({ ok: true, sessionId: id, tags });
  });

  app.get("/sessions/current", (_req, res) => {
    const id = opts.getCurrentSessionId?.();
    if (!id) return res.status(404).json({ error: "No current session" });
    res.json({ ok: true, sessionId: id, tags: opts.getCurrentSessionTags?.() ?? [] });
  });

  app.post("/sessions/current/tags", (req, res) => {
    const id = opts.getCurrentSessionId?.();
    if (!id) return res.status(404).json({ error: "No current session" });
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t: any) => String(t)).filter(Boolean) : [];
    opts.setCurrentSessionTags?.(tags);
    res.json({ ok: true, sessionId: id, tags: opts.getCurrentSessionTags?.() ?? tags });
  });

  app.get("/sessions", (req, res) => {
    if (!opts.sqlite) return res.status(501).json({ error: "SQLite persistence not configured" });
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, limitRaw!)) : 200;
    res.json({ ok: true, items: opts.sqlite.listSessions(limit) });
  });

  app.post("/sessions/:id/tags", (req, res) => {
    if (!opts.sqlite) return res.status(501).json({ error: "SQLite persistence not configured" });
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t: any) => String(t)).filter(Boolean) : [];
    opts.sqlite.setSessionTags(req.params.id, tags);
    res.json({ ok: true, sessionId: req.params.id, tags });
  });

  app.get("/sessions/:id/requests", (req, res) => {
    if (!opts.sqlite) return res.status(501).json({ error: "SQLite persistence not configured" });
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, limitRaw!)) : 2000;
    const items = opts.sqlite.queryRequests({ sessionId: req.params.id, limit });
    res.json({ ok: true, sessionId: req.params.id, count: items.length, items });
  });

  app.get("/sessions/:id/export", (req, res) => {
    if (!opts.sqlite) return res.status(501).json({ error: "SQLite persistence not configured" });
    const items = opts.sqlite.queryRequests({ sessionId: req.params.id, limit: 5000 });
    res.json({ ok: true, sessionId: req.params.id, items });
  });

  app.post("/sessions/:id/replay", async (req, res) => {
    if (!opts.sqlite) return res.status(501).json({ error: "SQLite persistence not configured" });

    const sessionId = req.params.id;
    const items = opts.sqlite.queryRequests({ sessionId, limit: 5000 });

    // Replay in original order (oldest → newest)
    items.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    let succeeded = 0;
    let failed = 0;
    const replayedIds: string[] = [];

    for (const item of items) {
      if (!item.targetUrl) {
        failed++;
        continue;
      }

      memoryStore.update(item.id, { replayStatus: "running", replayError: undefined });

      const url = item.targetUrl;
      const headers: Record<string, string> = { ...item.headers };
      delete headers["host"];
      delete headers["content-length"];

      let response: Response;
      let text: string;
      try {
        response = await fetch(url, {
          method: item.method,
          headers,
          body: item.body
        });
        text = await response.text();
      } catch {
        failed++;
        memoryStore.update(item.id, {
          replayStatus: "failed",
          replayedAt: Date.now(),
          replayError: "Replay failed (target unreachable)"
        });
        continue;
      }

      const replayed: CapturedRequest = {
        ...item,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        responseStatus: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        responseBody: text,
        duration: undefined
      };

      memoryStore.add(replayed);
      replayedIds.push(replayed.id);
      succeeded++;

      memoryStore.update(item.id, {
        replayStatus: "succeeded",
        replayedAt: Date.now(),
        replayedId: replayed.id,
        replayError: undefined
      });
    }

    res.json({ ok: true, sessionId, count: items.length, succeeded, failed, replayedIds });
  });

  app.post("/send-test", async (_req, res) => {
    const result = await sendTestRequest();
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ ok: true });
  });

  app.post("/replay/:id", async (req, res) => {
    const item = memoryStore.get(req.params.id);
    if (!item || !item.targetUrl) return res.status(404).json({ error: "Not found" });

    memoryStore.update(item.id, { replayStatus: "running", replayError: undefined });

    const url = item.targetUrl;

    const headers: Record<string, string> = { ...item.headers };
    delete headers["host"];
    delete headers["content-length"];

    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method: item.method,
        headers,
        body: item.body
      });
      text = await response.text();
    } catch {
      memoryStore.update(item.id, {
        replayStatus: "failed",
        replayedAt: Date.now(),
        replayError: "Replay failed (target unreachable)"
      });
      return res.status(502).json({ error: "Replay failed (target unreachable)" });
    }

    const replayed: CapturedRequest = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      responseStatus: response.status,
      responseHeaders: Object.fromEntries(response.headers.entries()),
      responseBody: text,
      duration: undefined
    };

    memoryStore.add(replayed);

    memoryStore.update(item.id, {
      replayStatus: "succeeded",
      replayedAt: Date.now(),
      replayedId: replayed.id,
      replayError: undefined
    });

    res.json(replayed);
  });

  app.post("/replay/:id/modify", async (req, res) => {
    const item = memoryStore.get(req.params.id);
    if (!item || !item.targetUrl) return res.status(404).json({ error: "Not found" });

    memoryStore.update(item.id, { replayStatus: "running", replayError: undefined });

    const { headers: modifiedHeaders, body: modifiedBody, method: modifiedMethod } = req.body || {};

    const url = item.targetUrl;
    const method = modifiedMethod || item.method;

    const headers: Record<string, string> = { ...item.headers };
    delete headers["host"];
    delete headers["content-length"];

    // Apply modifications
    if (modifiedHeaders && typeof modifiedHeaders === "object") {
      for (const [key, value] of Object.entries(modifiedHeaders)) {
        if (value === null || value === undefined) {
          delete headers[key.toLowerCase()];
        } else {
          headers[key] = String(value);
        }
      }
    }

    const body = modifiedBody !== undefined ? modifiedBody : item.body;

    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method,
        headers,
        body
      });
      text = await response.text();
    } catch {
      memoryStore.update(item.id, {
        replayStatus: "failed",
        replayedAt: Date.now(),
        replayError: "Replay failed (target unreachable)"
      });
      return res.status(502).json({ error: "Replay failed (target unreachable)" });
    }

    const replayed: CapturedRequest = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      method,
      headers,
      rawHeaders: headers,
      body,
      responseStatus: response.status,
      responseHeaders: Object.fromEntries(response.headers.entries()),
      responseBody: text,
      duration: undefined
    };

    memoryStore.add(replayed);

    memoryStore.update(item.id, {
      replayStatus: "succeeded",
      replayedAt: Date.now(),
      replayedId: replayed.id,
      replayError: undefined
    });

    res.json(replayed);
  });

  return app.listen(opts.port, "127.0.0.1");
}
