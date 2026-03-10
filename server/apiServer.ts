import express from "express";
import cors from "cors";
import type { CapturedRequest } from "../types/capturedRequest";
import { memoryStore } from "../storage/memoryStore";

export interface ApiServerOptions {
  port: number;
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

  app.get("/requests/:id", (req, res) => {
    const item = memoryStore.get(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
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
