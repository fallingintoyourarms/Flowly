import { nanoid } from "nanoid";
import type { IncomingMessage } from "node:http";
import type { CapturedRequest } from "../types/capturedRequest.js";

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

function headerValue(headers: Record<string, string>, key: string): string | undefined {
  const direct = headers[key];
  if (typeof direct === "string") return direct;
  const lowerKey = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lowerKey) return v;
  }
  return undefined;
}

function parseGraphqlMetadata(body: string | undefined): CapturedRequest["graphql"] | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as any;
    const query = typeof parsed?.query === "string" ? parsed.query : undefined;
    const operationName = typeof parsed?.operationName === "string" ? parsed.operationName : undefined;
    if (!query && !operationName) return undefined;

    const trimmed = (query ?? "").trim();
    const match = /^(query|mutation|subscription)\b/i.exec(trimmed);
    const operationType = (match?.[1]?.toLowerCase() as any) ?? undefined;

    return {
      operationType,
      operationName
    };
  } catch {
    return undefined;
  }
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
  const rawHeaders = normalizeHeaders(req.headers);
  const ct = headerValue(rawHeaders, "content-type");
  const contentType = typeof ct === "string" ? ct.split(";")[0]?.trim().toLowerCase() : undefined;

  const isGrpc = contentType === "application/grpc" || contentType?.startsWith("application/grpc+");
  const isGraphql =
    contentType === "application/graphql" ||
    (contentType === "application/json" && typeof body === "string" && (body.includes("\"query\"") || body.includes("\"operationName\"")));

  const graphql = isGraphql ? parseGraphqlMetadata(body) : undefined;
  const protocol: CapturedRequest["protocol"] = isGrpc
    ? "grpc"
    : graphql?.operationType === "subscription"
      ? "graphql-subscription"
      : isGraphql
        ? "graphql"
        : "http";

  const grpc = isGrpc
    ? (() => {
        const p = req.url ?? "";
        const m = /^\/?([^/]+)\/?([^/]*)$/.exec(p);
        if (!m) return {};
        const service = m[1] || undefined;
        const method = m[2] || undefined;
        return { service, method };
      })()
    : undefined;

  return {
    id: nanoid(),
    method: req.method ?? "GET",
    path: req.url ?? "/",
    headers: maskHeaders(rawHeaders),
    rawHeaders,
    body,
    timestamp: Date.now(),
    targetUrl,
    protocol,
    contentType,
    graphql,
    grpc
  };
}
