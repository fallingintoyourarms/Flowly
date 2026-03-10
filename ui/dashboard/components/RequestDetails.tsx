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

export function RequestDetails(props: {
  request: CapturedRequest | null;
  onReplayed: () => void;
}) {
  const r = props.request;

  const replay = async () => {
    if (!r) return;
    await fetch(`/api/replay/${r.id}`, { method: "POST" });
    props.onReplayed();
  };

  if (!r) {
    return <div style={{ padding: 18, color: "var(--muted)" }}>No request selected</div>;
  }

  return (
    <div style={{ height: "100vh", overflow: "auto" }}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
              {r.method} {r.path}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              <span className="badge">id: {r.id}</span>
              <span style={{ marginLeft: 8 }} className="badge">
                status: {r.responseStatus ?? "-"}
              </span>
              <span style={{ marginLeft: 8 }} className="badge">
                time: {typeof r.duration === "number" ? `${r.duration}ms` : "-"}
              </span>
            </div>
          </div>
          <button className="button" onClick={replay}>Replay Request</button>
        </div>
      </div>

      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Request</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Headers</div>
          <div className="code">{headersToPretty(r.headers)}</div>
          <div style={{ height: 12 }} />
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Body</div>
          <div className="code">{formatMaybeJson(r.body) || "(empty)"}</div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Response</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Headers</div>
          <div className="code">{headersToPretty(r.responseHeaders)}</div>
          <div style={{ height: 12 }} />
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Body</div>
          <div className="code">{formatMaybeJson(r.responseBody) || "(empty)"}</div>
        </div>
      </div>
    </div>
  );
}
