import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import zlib from "node:zlib";
import httpProxy from "http-proxy";
import { memoryStore } from "../storage/memoryStore.js";
import { captureRequest } from "./requestCapture.js";
import { captureResponse } from "./responseCapture.js";
import type { WebSocketFrame } from "../types/capturedRequest.js";

export interface ProxyServerOptions {
  port: number;
  target: string;
  ignoreHeaders?: string[];
  ignorePaths?: string[];
  maxBodyBytes?: number;
}

// Track WebSocket connections for frame capture
const wsConnections = new Map<string, { frames: WebSocketFrame[] }>();

function shouldIgnorePath(path: string, ignorePaths: string[] | undefined): boolean {
  if (!ignorePaths || ignorePaths.length === 0) return false;
  return ignorePaths.some((p) => p && (path === p || path.startsWith(p)));
}

function maybeTruncateUtf8(text: string, maxBytes: number | undefined): string {
  if (!maxBytes || maxBytes <= 0) return text;
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return text;
  const buf = Buffer.from(text, "utf8");
  const sliced = buf.subarray(0, maxBytes).toString("utf8");
  return `${sliced}\n…(truncated to ${maxBytes} bytes)`;
}

function decompressForCapture(proxyRes: IncomingMessage, raw: Buffer): string {
  const encHeader = proxyRes.headers["content-encoding"];
  const enc = (Array.isArray(encHeader) ? encHeader[0] : encHeader)?.toString().toLowerCase();

  try {
    if (enc === "gzip") return zlib.gunzipSync(raw).toString("utf8");
    if (enc === "deflate") return zlib.inflateSync(raw).toString("utf8");
    if (enc === "br") return zlib.brotliDecompressSync(raw).toString("utf8");
  } catch {
    // If decompression fails, fall back to raw UTF-8 decoding.
  }

  return raw.toString("utf8");
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
  let targetBase: URL | null = null;
  try {
    targetBase = new URL(opts.target);
  } catch {
    targetBase = null;
  }

  function stripHeaders(
    headers: Record<string, string> | undefined,
    ignore: string[] | undefined
  ): Record<string, string> | undefined {
    if (!headers) return headers;
    if (!ignore || ignore.length === 0) return headers;

    const ignoreSet = new Set(ignore.map((h) => h.toLowerCase()));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (ignoreSet.has(k.toLowerCase())) continue;
      out[k] = v;
    }
    return out;
  }

  const proxy = httpProxy.createProxyServer({
    target: opts.target,
    changeOrigin: true,
    selfHandleResponse: true
  });

  proxy.on("error", (_err: Error, _req: http.IncomingMessage, res: http.ServerResponse) => {
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
  proxy.on("proxyRes", (proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse) => {
    const startedAt = (req as any).__flowlyStartedAt as number | undefined;
    const requestId = (req as any).__flowlyRequestId as string | undefined;

    const chunks: Buffer[] = [];
    proxyRes.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    proxyRes.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      const capturedBody = maybeTruncateUtf8(decompressForCapture(proxyRes, rawBody), opts.maxBodyBytes);

      if (requestId && startedAt) {
      const patch = captureResponse(proxyRes, capturedBody, startedAt);
      patch.responseHeaders = stripHeaders(patch.responseHeaders, opts.ignoreHeaders);
      patch.rawResponseHeaders = stripHeaders(patch.rawResponseHeaders, opts.ignoreHeaders);
      memoryStore.update(requestId, patch);
      }

      const headers: Record<string, string | string[] | undefined> = { ...proxyRes.headers };
      (res as ServerResponse).writeHead(proxyRes.statusCode ?? 200, headers);
      // Forward response to client unchanged (still compressed if upstream sent it that way).
      (res as ServerResponse).end(rawBody);
    });
  });

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();

    let targetUrl = opts.target;
    if (targetBase) {
      try {
        targetUrl = new URL(req.url ?? "/", targetBase).toString();
      } catch {
        targetUrl = targetBase.toString();
      }
    }

    const requestPath = req.url ?? "/";
    if (shouldIgnorePath(requestPath, opts.ignorePaths)) {
      proxy.web(req, res, { target: opts.target });
      return;
    }

    // Read the incoming request body once. Since http-proxy will need a readable
    // stream, we re-create a new request stream by writing the body into proxyReq.
    const body = maybeTruncateUtf8((await readStreamBody(req)) ?? "", opts.maxBodyBytes) || undefined;

    const captured = captureRequest(req, body, targetUrl);
    captured.headers = stripHeaders(captured.headers, opts.ignoreHeaders) ?? {};
    captured.rawHeaders = stripHeaders(captured.rawHeaders, opts.ignoreHeaders);

    memoryStore.add(captured);

    (req as any).__flowlyStartedAt = startedAt;
    (req as any).__flowlyRequestId = captured.id;

    proxy.once("proxyReq", (proxyReq: http.ClientRequest) => {
      if (body) {
        proxyReq.setHeader("content-length", Buffer.byteLength(body));
        proxyReq.write(body);
      }
      proxyReq.end();
    });

    proxy.web(req, res, { target: opts.target });
  });

  server.on("upgrade", (req, socket, head) => {
    const targetUrl = targetBase ? new URL(req.url ?? "/", targetBase) : null;
    if (!targetUrl) {
      socket.destroy();
      return;
    }
    const isWS = targetUrl.protocol === "ws:" || targetUrl.protocol === "wss:" || opts.target.startsWith("ws");
    
    if (!isWS) {
      proxy.ws(req, socket as any, head, { target: opts.target });
      return;
    }

    const captured = captureRequest(req, undefined, targetUrl.toString());
    captured.isWebSocket = true;
    captured.protocol = "websocket";
    const ctHeader = captured.rawHeaders?.["content-type"] ?? captured.rawHeaders?.["Content-Type"];
    if (typeof ctHeader === "string") captured.contentType = ctHeader.split(";")[0]?.trim().toLowerCase();
    captured.headers = stripHeaders(captured.headers, opts.ignoreHeaders) ?? {};
    captured.rawHeaders = stripHeaders(captured.rawHeaders, opts.ignoreHeaders);
    memoryStore.add(captured);

    wsConnections.set(captured.id, { frames: [] });

    proxy.ws(req, socket as any, head, { target: opts.target }, (err: Error | null, targetSocket?: any) => {
      if (err) {
        socket.destroy();
        return;
      }

      socket.on("data", (data: Buffer) => {
        const frame: WebSocketFrame = {
          type: "text",
          direction: "client",
          data: data.toString("utf8"),
          timestamp: Date.now()
        };
        const conn = wsConnections.get(captured.id);
        if (conn) {
          conn.frames.push(frame);
          memoryStore.update(captured.id, { wsFrames: conn.frames });
        }
      });

      // Capture frames from server to client
      targetSocket?.on("data", (data: Buffer) => {
        const frame: WebSocketFrame = {
          type: "text",
          direction: "server",
          data: data.toString("utf8"),
          timestamp: Date.now()
        };
        const conn = wsConnections.get(captured.id);
        if (conn) {
          conn.frames.push(frame);
          memoryStore.update(captured.id, { wsFrames: conn.frames });
        }
      });

      // Clean up on close
      socket.on("close", () => {
        wsConnections.delete(captured.id);
      });
      targetSocket?.on("close", () => {
        wsConnections.delete(captured.id);
      });
    });
  });

  server.listen(opts.port, "127.0.0.1");
  return server;
}
