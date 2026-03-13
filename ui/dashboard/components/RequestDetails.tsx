import React from "react";
import type { CapturedRequest } from "../../../types/capturedRequest.js";
import { Badge } from "../../src/components/ui/badge.js";
import { Button } from "../../src/components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../src/components/ui/card.js";
import { Input } from "../../src/components/ui/input.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../src/components/ui/tooltip.js";
import {
  Copy,
  Edit3,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  X,
  AlertTriangle,
  Activity,
  Braces,
  Cable
} from "lucide-react";

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

function safeJsonParse<T>(text: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
}

function protoIcon(p: CapturedRequest["protocol"] | undefined) {
  if (p === "graphql" || p === "graphql-subscription") return <Braces className="h-4 w-4" />;
  if (p === "grpc") return <Cable className="h-4 w-4" />;
  if (p === "websocket") return <Activity className="h-4 w-4" />;
  return null;
}

export function RequestDetails(props: {
  request: CapturedRequest | null;
  onReplayed: () => void;
}) {
  const r = props.request;
  const [revealSensitive, setRevealSensitive] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editHeaders, setEditHeaders] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [editMethod, setEditMethod] = React.useState("");
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle");

  React.useEffect(() => {
    if (!r) return;
    const headers = revealSensitive ? r.rawHeaders ?? r.headers : r.headers;
    setEditHeaders(JSON.stringify(headers ?? {}, null, 2));
    setEditBody(r.body || "");
    setEditMethod(r.method);
    setIsEditing(false);
    setCopyState("idle");
  }, [r?.id, revealSensitive]);

  const requestHeaders = revealSensitive ? r?.rawHeaders ?? r?.headers : r?.headers;
  const responseHeaders = revealSensitive ? r?.rawResponseHeaders ?? r?.responseHeaders : r?.responseHeaders;

  const hints = React.useMemo(() => (r ? analyzeHttpError(r) : []), [r]);
  const proto = React.useMemo(() => (r ? protocolBadge(r) : null), [r]);
  const protoHints = React.useMemo(() => (r ? protocolInsights(r) : []), [r]);

  const copyCurl = React.useCallback(async () => {
    if (!r) return;
    const text = toCurl(r, revealSensitive);
    await navigator.clipboard.writeText(text);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 900);
  }, [r, revealSensitive]);

  const replay = React.useCallback(async () => {
    if (!r) return;
    await fetch(`/api/replay/${r.id}`, { method: "POST" });
    props.onReplayed();
  }, [r, props]);

  const replayModified = React.useCallback(async () => {
    if (!r) return;

    const parsed = safeJsonParse<Record<string, string>>(editHeaders);
    if (!parsed.ok) {
      alert("Invalid JSON in headers");
      return;
    }

    await fetch(`/api/replay/${r.id}/modify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        headers: parsed.value,
        body: editBody,
        method: editMethod
      })
    });

    setIsEditing(false);
    props.onReplayed();
  }, [r, editHeaders, editBody, editMethod, props]);

  if (!r) {
    return <div className="p-6 text-sm text-muted-foreground">No request selected</div>;
  }

  return (
    <TooltipProvider>
      <div className="h-full">
        <div className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="truncate font-mono text-sm">
                {r.method} {r.path}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="muted">id: {r.id}</Badge>
                {r.sessionId && <Badge variant="muted">session: {r.sessionId}</Badge>}
                {Array.isArray(r.sessionTags) && r.sessionTags.length > 0 && (
                  <Badge variant="secondary">tags: {r.sessionTags.join(", ")}</Badge>
                )}
                {proto && (
                  <Badge variant="secondary" className="gap-1">
                    {protoIcon(r.protocol)}
                    proto: {proto}
                  </Badge>
                )}
                {r.contentType && <Badge variant="muted">ct: {r.contentType}</Badge>}
                <Badge variant={typeof r.responseStatus === "number" && r.responseStatus >= 400 ? "warn" : "muted"}>
                  status: {r.responseStatus ?? "-"}
                </Badge>
                <Badge variant="muted">time: {typeof r.duration === "number" ? `${r.duration}ms` : "-"}</Badge>

                {r.replayStatus && r.replayStatus !== "idle" && (
                  <Badge
                    variant={r.replayStatus === "running" ? "secondary" : r.replayStatus === "succeeded" ? "success" : "danger"}
                  >
                    replay: {r.replayStatus}
                  </Badge>
                )}
                {Array.isArray(r.anomalies) && r.anomalies.length > 0 && (
                  <Badge variant="warn" className="gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    insights: {r.anomalies.length}
                  </Badge>
                )}
                {r.replayedAt && <Badge variant="muted">replayed: {new Date(r.replayedAt).toLocaleTimeString()}</Badge>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setRevealSensitive((v) => !v)} aria-label="Toggle sensitive">
                    {revealSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{revealSensitive ? "Hide" : "Reveal"} sensitive values</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => void copyCurl()} aria-label="Copy cURL">
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copyState === "copied" ? "Copied" : "Copy as cURL"}</TooltipContent>
              </Tooltip>

              {!isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => void replay()}>
                    <RotateCcw className="h-4 w-4" />
                    Replay
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="default" size="sm" onClick={() => void replayModified()}>
                    <Save className="h-4 w-4" />
                    Replay Modified
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
          {Array.isArray(r.anomalies) && r.anomalies.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {r.anomalies.map((a, idx) => (
                    <div key={idx} className="rounded-md border bg-muted/30 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warn" : "secondary"}>
                          {a.type}
                        </Badge>
                        <span className="text-muted-foreground">{a.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          <div className="space-y-4">
            {(hints.length > 0 || r.replayError) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-200" />
                    Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {r.replayError && (
                    <div className="text-sm">
                      <Badge variant="danger">replay</Badge>
                      <span className="ml-2 text-muted-foreground">{r.replayError}</span>
                    </div>
                  )}
                  {hints.map((h, idx) => (
                    <div key={idx} className="text-sm">
                      <Badge variant={r.responseStatus && r.responseStatus >= 500 ? "danger" : "warn"}>hint</Badge>
                      <span className="ml-2 text-muted-foreground">{h}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {protoHints.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {protoIcon(r.protocol) ?? <Activity className="h-4 w-4" />}
                    Protocol
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {protoHints.map((h, idx) => (
                    <div key={idx} className="text-sm">
                      <Badge variant="muted">info</Badge>
                      <span className="ml-2 text-muted-foreground">{h}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing && (
                  <div className="grid gap-2">
                    <div className="text-xs text-muted-foreground">Method</div>
                    <select
                      value={editMethod}
                      onChange={(e) => setEditMethod(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <div className="mb-2 text-xs text-muted-foreground">Headers</div>
                  {isEditing ? (
                    <textarea
                      value={editHeaders}
                      onChange={(e) => setEditHeaders(e.target.value)}
                      className="min-h-40 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : (
                    <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-xs">
                      {headersToPretty(requestHeaders) || "(empty)"}
                    </pre>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-xs text-muted-foreground">Body</div>
                  {isEditing ? (
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="min-h-40 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : (
                    <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-xs">
                      {formatMaybeJson(r.body) || "(empty)"}
                    </pre>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Response</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {r.isWebSocket ? (
                  <>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">WebSocket</Badge>
                      <Badge variant="muted">frames: {(r.wsFrames || []).length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {(r.wsFrames || []).length === 0 ? (
                        <div className="text-sm text-muted-foreground">No frames captured yet...</div>
                      ) : (
                        (r.wsFrames || []).map((frame: any, i: number) => {
                          const outbound = frame.direction === "client";
                          return (
                            <div
                              key={i}
                              className={
                                "rounded-md border p-3 " +
                                (outbound
                                  ? "border-blue-500/30 bg-blue-500/10"
                                  : "border-emerald-500/30 bg-emerald-500/10")
                              }
                            >
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{outbound ? "→ Server" : "← Server"}</span>
                                <span>{frame.timestamp ? new Date(frame.timestamp).toLocaleTimeString() : ""}</span>
                              </div>
                              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">
                                {frame.data || "(binary)"}
                              </pre>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="mb-2 text-xs text-muted-foreground">Headers</div>
                      <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-xs">
                        {headersToPretty(responseHeaders) || "(empty)"}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-2 text-xs text-muted-foreground">Body</div>
                      <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-xs">
                        {formatMaybeJson(r.responseBody) || "(empty)"}
                      </pre>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
