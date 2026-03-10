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
): Pick<CapturedRequest, "responseStatus" | "responseHeaders" | "responseBody" | "duration"> {
  return {
    responseStatus: proxyRes.statusCode,
    responseHeaders: normalizeHeaders(proxyRes.headers),
    responseBody: body,
    duration: Date.now() - startedAt
  };
}
