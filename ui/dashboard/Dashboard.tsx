import React from "react";
import type { CapturedRequest } from "../../types/capturedRequest.js";
import { RequestList } from "./components/RequestList";
import { RequestDetails } from "./components/RequestDetails";

async function fetchRequests(): Promise<CapturedRequest[]> {
  const res = await fetch("/api/requests");
  return res.json();
}

async function sendTestRequestThroughProxy(): Promise<void> {
  await fetch("/api/send-test", { method: "POST" });
}

type AnalyticsOverview = {
  ok: boolean;
  windowSec: number;
  total: number;
  rps: number;
  avgResponseMs: number | null;
  statusCounts: Record<string, number>;
  latencyHistogram: Array<{ min: number; max: number; count: number }>;
};

async function fetchAnalytics(): Promise<AnalyticsOverview> {
  const res = await fetch("/api/analytics/overview?windowSec=30");
  return res.json();
}

async function fetchQuery(params: {
  method?: string;
  statusMin?: string;
  statusMax?: string;
  q?: string;
  regex?: string;
}): Promise<CapturedRequest[]> {
  const sp = new URLSearchParams();
  if (params.method) sp.set("method", params.method);
  if (params.statusMin) sp.set("statusMin", params.statusMin);
  if (params.statusMax) sp.set("statusMax", params.statusMax);
  if (params.q) sp.set("q", params.q);
  if (params.regex) sp.set("regex", params.regex);
  sp.set("limit", "500");

  const res = await fetch(`/api/requests/query?${sp.toString()}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.items ?? []);
}

export function Dashboard() {
  const [items, setItems] = React.useState<CapturedRequest[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [live, setLive] = React.useState(false);

  const [filterMethod, setFilterMethod] = React.useState<string>("");
  const [filterStatusMin, setFilterStatusMin] = React.useState<string>("");
  const [filterStatusMax, setFilterStatusMax] = React.useState<string>("");
  const [filterQ, setFilterQ] = React.useState<string>("");
  const [filterRegex, setFilterRegex] = React.useState<string>("");
  const [analytics, setAnalytics] = React.useState<AnalyticsOverview | null>(null);

  const hasActiveFilter = Boolean(
    filterMethod || filterStatusMin || filterStatusMax || filterQ || filterRegex
  );

  const togglePaused = async (next: boolean) => {
    setPaused(next);
    await fetch("/api/pause", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: next })
    });
  };

  const clearAll = async () => {
    await fetch("/api/clear", { method: "POST" });
  };

  React.useEffect(() => {
    let alive = true;

    const init = async () => {
      const data = await fetchRequests();
      if (!alive) return;
      setItems(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    };

    init();

    const es = new EventSource("/api/events");

    es.addEventListener("open", () => setLive(true));
    es.addEventListener("error", () => setLive(false));

    es.addEventListener("request_added", (e) => {
      const msg = JSON.parse((e as MessageEvent).data);
      const req = msg.request as CapturedRequest;
      setItems((prev) => [req, ...prev]);
      setSelectedId((prevSel) => prevSel ?? req.id);
    });

    es.addEventListener("request_updated", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as { id: string; patch: Partial<CapturedRequest> };
      setItems((prev) => prev.map((r) => (r.id === msg.id ? { ...r, ...msg.patch } : r)));
    });

    es.addEventListener("cleared", () => {
      setItems([]);
      setSelectedId(null);
    });

    es.addEventListener("paused", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as { paused: boolean };
      setPaused(Boolean(msg.paused));
    });

    return () => {
      alive = false;
      es.close();
    };
  }, [selectedId]);

  React.useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const a = await fetchAnalytics();
        if (!alive) return;
        setAnalytics(a);
      } catch {
        if (!alive) return;
        setAnalytics(null);
      }
    };

    run();
    const t = window.setInterval(run, 1000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  React.useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!hasActiveFilter) return;
      try {
        const data = await fetchQuery({
          method: filterMethod || undefined,
          statusMin: filterStatusMin || undefined,
          statusMax: filterStatusMax || undefined,
          q: filterQ || undefined,
          regex: filterRegex || undefined
        });
        if (!alive) return;
        setItems(data);
        if (data[0]) setSelectedId((prev) => prev ?? data[0].id);
      } catch {
        // ignore
      }
    };

    const t = window.setTimeout(run, 150);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [hasActiveFilter, filterMethod, filterStatusMin, filterStatusMax, filterQ, filterRegex]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const fileRef = React.useRef<HTMLInputElement | null >(null);

  const importTraceFromFile = async (file: File) => { 
    const text = await file.text();
    const parsed = JSON.parse(text);

    await fetch("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed)
    });
  };

  return (
    <div className="appShell">
      <div className="sidePanel">
        <div className="panelHeader">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div className="titleRow">
                <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>Flowly</div>
                <span className={`badge ${live ? "badge--ok" : "badge--warn"}`}>{live ? "live" : "offline"}</span>
                <span className="badge">{items.length}</span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Local API traffic debugger</div>
            </div>
            <div className="toolbar">
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importTraceFromFile(f);
                  e.currentTarget.value = "";
                }}
              />

              <button className="button" onClick={() => fileRef.current?.click()}>
                Import JSON
              </button>
              <div className="toolbarGroup">
                <label style={{ color: "var(--muted)", fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={paused}
                    onChange={(e) => void togglePaused(e.target.checked)}
                  />
                  Pause
                </label>
                <button className="button" onClick={() => void clearAll()}>
                  Clear
                </button>
                <button className="button" onClick={() => void sendTestRequestThroughProxy()}>
                  Send test request
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              style={{ background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px" }}
            >
              <option value="">All methods</option>
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <input
              value={filterStatusMin}
              onChange={(e) => setFilterStatusMin(e.target.value)}
              placeholder="Status min"
              style={{ width: 110, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px" }}
            />
            <input
              value={filterStatusMax}
              onChange={(e) => setFilterStatusMax(e.target.value)}
              placeholder="Status max"
              style={{ width: 110, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px" }}
            />
            <input
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder="Keyword"
              style={{ flex: "1 1 140px", minWidth: 140, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px" }}
            />
            <input
              value={filterRegex}
              onChange={(e) => setFilterRegex(e.target.value)}
              placeholder="Regex"
              style={{ flex: "1 1 160px", minWidth: 160, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px" }}
            />

            <button
              className="button"
              onClick={() => {
                setFilterMethod("");
                setFilterStatusMin("");
                setFilterStatusMax("");
                setFilterQ("");
                setFilterRegex("");
                void fetchRequests().then((d) => setItems(d));
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
            <span className="badge">rps: {analytics ? analytics.rps.toFixed(2) : "-"}</span>
            <span className="badge">avg: {analytics?.avgResponseMs !== null && analytics?.avgResponseMs !== undefined ? `${Math.round(analytics.avgResponseMs)}ms` : "-"}</span>
            <span className="badge">4xx: {analytics ? analytics.statusCounts["4xx"] ?? 0 : "-"}</span>
            <span className="badge">5xx: {analytics ? analytics.statusCounts["5xx"] ?? 0 : "-"}</span>
            {hasActiveFilter && <span className="badge">filtered</span>}
          </div>
        </div>
        <RequestList items={items} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div className="mainPanel">
        <RequestDetails request={selected} onReplayed={() => void 0} />
      </div>
    </div>
  );
}
