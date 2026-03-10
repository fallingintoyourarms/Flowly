import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import httpProxy from "http-proxy";
import { memoryStore } from "../storage/memoryStore";
import { captureRequest } from "./requestCapture";
import { captureResponse } from "./responseCapture";

export interface ProxyServerOptions {
  port: number;
  target: string;
}

function readStreamBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", () => resolve(undefined));
  });
}

/**
 * Creates and starts the Flowly proxy server.
 *
 * Key responsibilities:
 * - Accept incoming HTTP requests from the frontend
 * - Forward them to the configured API target
 * - Intercept request + response data for the dashboard
 */
export function startProxyServer(opts: ProxyServerOptions): http.Server {
  const proxy = httpProxy.createProxyServer({
    target: opts.target,
    changeOrigin: true,
    selfHandleResponse: true
  });

  proxy.on("error", (_err, _req, res) => {
    const r = res as ServerResponse;
    if (r.headersSent) return;
    r.writeHead(502, { "content-type": "application/json" });
    r.end(JSON.stringify({ error: "Bad gateway" }));
  });

  /**
   * Intercept the target response.
   *
   * With `selfHandleResponse: true`, http-proxy will not automatically pipe the
   * response back. We read the response stream ourselves so we can store it,
   * then write it to the client unchanged.
   */
  proxy.on("proxyRes", (proxyRes, req, res) => {
    const startedAt = (req as any).__flowlyStartedAt as number | undefined;
    const requestId = (req as any).__flowlyRequestId as string | undefined;

    const chunks: Buffer[] = [];
    proxyRes.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");

      if (requestId && startedAt) {
        memoryStore.update(requestId, captureResponse(proxyRes, body, startedAt));
      }

      const headers: Record<string, string | string[] | undefined> = { ...proxyRes.headers };
      (res as ServerResponse).writeHead(proxyRes.statusCode ?? 200, headers);
      (res as ServerResponse).end(body);
    });
  });

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();

    const targetUrl = new URL(req.url ?? "/", opts.target).toString();

    // Read the incoming request body once. Since http-proxy will need a readable
    // stream, we re-create a new request stream by writing the body into proxyReq.
    const body = await readStreamBody(req);

    const captured = captureRequest(req, body, targetUrl);
    memoryStore.add(captured);

    (req as any).__flowlyStartedAt = startedAt;
    (req as any).__flowlyRequestId = captured.id;

    proxy.once("proxyReq", (proxyReq) => {
      if (body) {
        proxyReq.setHeader("content-length", Buffer.byteLength(body));
        proxyReq.write(body);
      }
      proxyReq.end();
    });

    proxy.web(req, res, { target: opts.target });
  });

  server.listen(opts.port, "127.0.0.1");
  return server;
}
