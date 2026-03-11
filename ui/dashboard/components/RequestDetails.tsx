import React from "react";
import type { CapturedRequest } from "../../../types/capturedRequest";

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
  const [revealSensitive, setRevealSensitive] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editHeaders, setEditHeaders] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [editMethod, setEditMethod] = React.useState("");

  React.useEffect(() => {
    if (r) {
      const headers = revealSensitive ? r.rawHeaders ?? r.headers : r.headers;
      setEditHeaders(JSON.stringify(headers, null, 2));
      setEditBody(r.body || "");
      setEditMethod(r.method);
    }
  }, [r, revealSensitive]);

  const replay = async () => {
    if (!r) return;
    await fetch(`/api/replay/${r.id}`, { method: "POST" });
    props.onReplayed();
  };

  const replayModified = async () => {
    if (!r) return;
    
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(editHeaders);
    } catch {
      alert("Invalid JSON in headers");
      return;
    }

    await fetch(`/api/replay/${r.id}/modify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        headers: parsedHeaders,
        body: editBody,
        method: editMethod
      })
    });
    
    setIsEditing(false);
    props.onReplayed();
  };

  if (!r) {
    return <div style={{ padding: 18, color: "var(--muted)" }}>No request selected</div>;
  }

  const requestHeaders = revealSensitive ? r.rawHeaders ?? r.headers : r.headers;
  const responseHeaders = revealSensitive ? r.rawResponseHeaders ?? r.responseHeaders : r.responseHeaders;
  const hints = analyzeHttpError(r);

  const copyCurl = async () => {
    const text = toCurl(r, revealSensitive);
    await navigator.clipboard.writeText(text);
  };

  return (
    <div style={{ height: "100vh", overflow: "auto" }}>
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
          position: "sticky",
          top: 0,
          zIndex: 5
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
              {r.method} {r.path}
            </div>

      {hints.length > 0 && (
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)", background: "var(--panel2)" }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.2, marginBottom: 10 }}>Analysis</div>
          <div style={{ display: "grid", gap: 8 }}>
            {r.replayError && (
              <div style={{ color: "var(--text)", fontSize: 12, lineHeight: 1.4 }}>
                <span className="badge badge--err">replay</span>
                <span style={{ marginLeft: 8, color: "var(--muted)" }}>{r.replayError}</span>
              </div>
            )}
            {hints.map((h: string, idx: number) => (
              <div key={idx} style={{ color: "var(--text)", fontSize: 12, lineHeight: 1.4 }}>
                <span className={`badge ${r.responseStatus && r.responseStatus >= 500 ? "badge--err" : "badge--warn"}`}>hint</span>
                <span style={{ marginLeft: 8, color: "var(--muted)" }}>{h}</span>
              </div>
            ))}
          </div>
        </div>
      )}
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              <span className="badge">id: {r.id}</span>
              <span style={{ marginLeft: 8 }} className="badge">
                status: {r.responseStatus ?? "-"}
              </span>
              <span style={{ marginLeft: 8 }} className="badge">
                time: {typeof r.duration === "number" ? `${r.duration}ms` : "-"}
              </span>

              {r.replayStatus && r.replayStatus !== "idle" && (
                <span
                  style={{ marginLeft: 8 }}
                  className={`badge ${r.replayStatus === "running" ? "" : r.replayStatus === "succeeded" ? "badge--ok" : "badge--err"}`}
                >
                  replay: {r.replayStatus}
                </span>
              )}
              {r.replayedAt && (
                <span style={{ marginLeft: 8 }} className="badge">
                  replayed: {new Date(r.replayedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <div className="toolbar">
            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--muted)", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={revealSensitive}
                onChange={(e) => setRevealSensitive(e.target.checked)}
              />
              Reveal sensitive values
            </label>
            <button className="button" onClick={copyCurl}>Copy as cURL</button>
            {!isEditing ? (
              <>
                <button className="button" onClick={replay}>Replay Request</button>
                <button className="button" onClick={() => setIsEditing(true)}>Edit & Replay</button>
              </>
            ) : (
              <>
                <button className="button" onClick={replayModified}>Replay Modified</button>
                <button className="button" onClick={() => setIsEditing(false)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 800, letterSpacing: 0.2, marginBottom: 10 }}>Request</div>
          
          {isEditing && (
            <>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Method</div>
              <select 
                value={editMethod} 
                onChange={(e) => setEditMethod(e.target.value)}
                style={{ 
                  background: "var(--panel2)", 
                  color: "var(--text)", 
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  marginBottom: 12,
                  width: "100%"
                }}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </>
          )}
          
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Headers</div>
          {isEditing ? (
            <textarea
              value={editHeaders}
              onChange={(e) => setEditHeaders(e.target.value)}
              style={{
                width: "100%",
                minHeight: 150,
                background: "var(--panel2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 10,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                resize: "vertical"
              }}
            />
          ) : (
            <div className="code">{headersToPretty(requestHeaders)}</div>
          )}
          
          <div style={{ height: 12 }} />
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Body</div>
          {isEditing ? (
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              style={{
                width: "100%",
                minHeight: 150,
                background: "var(--panel2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 10,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                resize: "vertical"
              }}
            />
          ) : (
            <div className="code">{formatMaybeJson(r.body) || "(empty)"}</div>
          )}
        </div>

        <div>
          <div style={{ fontWeight: 800, letterSpacing: 0.2, marginBottom: 10 }}>Response</div>
          {r.isWebSocket ? (
            <>
              <div className="badge" style={{ marginBottom: 10 }}>WebSocket</div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Frames</div>
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {(r.wsFrames || []).length === 0 ? (
                  <div style={{ color: "var(--muted)" }}>No frames captured yet...</div>
                ) : (
                  (r.wsFrames || []).map((frame, i) => (
                    <div 
                      key={i}
                      style={{
                        padding: "8px 10px",
                        marginBottom: 6,
                        borderRadius: 6,
                        background: frame.direction === "client" ? "rgba(96,165,250,0.1)" : "rgba(45,212,191,0.1)",
                        borderLeft: `3px solid ${frame.direction === "client" ? "var(--blue)" : "var(--green)"}`,
                        fontSize: 12
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 10 }}>
                        <span>{frame.direction === "client" ? "→ Server" : "← Server"}</span>
                        <span>{new Date(frame.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontFamily: "ui-monospace, monospace", marginTop: 4, wordBreak: "break-word" }}>
                        {frame.data || "(binary)"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Headers</div>
              <div className="code">{headersToPretty(responseHeaders)}</div>
              <div style={{ height: 12 }} />
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Body</div>
              <div className="code">{formatMaybeJson(r.responseBody) || "(empty)"}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
