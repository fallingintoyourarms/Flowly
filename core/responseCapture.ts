import type { IncomingMessage } from "node:http";
import type { CapturedRequest } from "../types/capturedRequest";

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-api-key"]);
const MASKED_VALUE = "***";

function normalizeHeaders(headers: IncomingMessage["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join(", ");
  }
  return out;
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? MASKED_VALUE : value;
  }
  return out;
}

/**
 * Captures response metadata and body.
 *
 * @param proxyRes Response returned by the target API
 * @param body Raw response body as a UTF-8 string
 * @param startedAt Timestamp in ms when the proxied request started
 */
export function captureResponse(
  proxyRes: IncomingMessage,
  body: string,
  startedAt: number
): Pick<
  CapturedRequest,
  "responseStatus" | "responseHeaders" | "rawResponseHeaders" | "responseBody" | "duration"
> {
  const rawResponseHeaders = normalizeHeaders(proxyRes.headers);
  return {
    responseStatus: proxyRes.statusCode,
    responseHeaders: maskHeaders(rawResponseHeaders),
    rawResponseHeaders,
    responseBody: body,
    duration: Date.now() - startedAt
  };
}
