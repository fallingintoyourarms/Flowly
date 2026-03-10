import express from "express";
import cors from "cors";
import type { CapturedRequest } from "../types/capturedRequest";
import { memoryStore } from "../storage/memoryStore";

export interface ApiServerOptions {
  port: number;
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

  app.get("/requests", (_req, res) => {
    res.json(memoryStore.all());
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

  app.post("/send-test", async (_req, res) => {
    const result = await sendTestRequest();
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ ok: true });
  });

  app.post("/replay/:id", async (req, res) => {
    const item = memoryStore.get(req.params.id);
    if (!item || !item.targetUrl) return res.status(404).json({ error: "Not found" });

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

    res.json(replayed);
  });

  return app.listen(opts.port, "127.0.0.1");
}
