import { nanoid } from "nanoid";
import type { IncomingMessage } from "node:http";
import type { CapturedRequest } from "../types/capturedRequest";

function normalizeHeaders(headers: IncomingMessage["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join(", ");
  }
  return out;
}

/**
 * Captures a request before forwarding it to the API.
 *
 * @param req Incoming HTTP request
 * @param body Raw request body as a UTF-8 string (if any)
 * @param targetUrl The resolved target URL the proxy will forward to
 * @returns A captured request object ready to store
 */
export function captureRequest(
  req: IncomingMessage,
  body: string | undefined,
  targetUrl: string
): CapturedRequest {
  return {
    id: nanoid(),
    method: req.method ?? "GET",
    path: req.url ?? "/",
    headers: normalizeHeaders(req.headers),
    body,
    timestamp: Date.now(),
    targetUrl
  };
}
