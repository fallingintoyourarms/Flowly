import React from "react";
import type { CapturedRequest } from "../../../types/capturedRequest.js";

function formatMaybeJson(text?: string): string {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }

}

function analyzeHttpError(req: CapturedRequest): string[] {
  const status = req.responseStatus;
  if (typeof status !== "number") return [];
  if (status < 400) return [];

  const hints: string[] = [];

  if (status === 401) hints.push("401 Unauthorized: check Authorization header / token / cookie. It may be missing or expired.");
  if (status === 403) hints.push("403 Forbidden: credentials are present but lack permissions or are scoped incorrectly.");
  if (status === 404) hints.push("404 Not Found: verify the path and base URL; check route/version mismatches.");
  if (status === 408) hints.push("408 Request Timeout: upstream may be slow; check server timeouts and request payload size.");
  if (status === 409) hints.push("409 Conflict: check resource versioning/ETags or duplicate create operations.");
  if (status === 422) hints.push("422 Unprocessable Entity: request body/schema validation failed; inspect request body.");
  if (status === 429) hints.push("429 Too Many Requests: rate limiting; reduce request rate or adjust limits.");
  if (status >= 500) hints.push("5xx Server Error: upstream error/crash; inspect response body and server logs.");

  const body = (req.responseBody ?? "").toLowerCase();
  if (body.includes("cors")) hints.push("Response mentions CORS: check Origin/Access-Control-* headers and server CORS config.");
  if (body.includes("csrf")) hints.push("Response mentions CSRF: ensure CSRF token/cookie is present and sent correctly.");

  return hints;
}

function protocolBadge(req: CapturedRequest): string | null {
  const p = req.protocol;
  if (!p || p === "http") return null;
  if (p === "websocket") return "ws";
  if (p === "graphql") return "graphql";
  if (p === "graphql-subscription") return "graphql-sub";
  if (p === "grpc") return "grpc";
  return null;
}

function protocolInsights(req: CapturedRequest): string[] {
  const out: string[] = [];

  if (req.protocol === "graphql" || req.protocol === "graphql-subscription") {
    const opType = req.graphql?.operationType;
    const opName = req.graphql?.operationName;

    out.push(`GraphQL: ${opType ?? "unknown"}${opName ? ` (${opName})` : ""}`);
    if (req.protocol === "graphql-subscription") {
      out.push("GraphQL subscription detected: subscriptions are long-lived; watch for keepalives and incremental payloads.");
    }
    if (req.responseStatus && req.responseStatus >= 400) {
      out.push("If this is GraphQL over HTTP, check for `errors` in the JSON response body even when status is 200.");
    }
  }

  if (req.protocol === "grpc") {
    const service = req.grpc?.service;
    const method = req.grpc?.method;
    out.push(`gRPC: ${service ?? "(unknown service)"}${method ? `/${method}` : ""}`);
    if (req.contentType) out.push(`content-type: ${req.contentType}`);
    out.push("Note: Flowly currently captures gRPC at the HTTP/2 metadata level only");
    out.push("For debugging, look at `grpc-status` / `grpc-message` response headers if present.");
  }

  return out;
}

function headersToPretty(headers?: Record<string, string>): string {
  if (!headers) return "";
  const sorted = Object.keys(headers)
    .sort((a, b) => a.localeCompare(b))
    .reduce<Record<string, string>>((acc, k) => {
      acc[k] = headers[k];
      return acc;
    }, {});
  return JSON.stringify(sorted, null, 2);
}

function shellEscapeSingleQuotes(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toCurl(req: CapturedRequest, revealSensitive: boolean): string {
  const url = req.targetUrl ?? req.path;
  const headers = revealSensitive ? req.rawHeaders ?? req.headers : req.headers;

  const parts: string[] = [];
  parts.push("curl");
  parts.push("-X", req.method);

  for (const [k, v] of Object.entries(headers)) {
    parts.push("-H", shellEscapeSingleQuotes(`${k}: ${v}`));
  }

  if (req.body && req.body.length > 0) {
    parts.push("--data-raw", shellEscapeSingleQuotes(req.body));
  }

  parts.push(shellEscapeSingleQuotes(url));
  return parts.join(" ");
}

export function RequestDetails(props: {
  request: CapturedRequest | null;
  onReplayed: () => void;
}) {
  const r = props.request;
  if (!r) return <div className="p-6 text-sm text-muted-foreground">No request selected</div>;
  return (
    <div className="p-6">
      <div className="text-sm font-semibold">{r.method} {r.path}</div>
      <div className="mt-2 text-sm text-muted-foreground">Request details UI is being rebuilt with Tailwind/shadcn.</div>
    </div>
  );
}
