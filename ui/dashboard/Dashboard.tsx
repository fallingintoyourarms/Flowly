import React from "react";
import type { CapturedRequest } from "../../types/capturedRequest";
import { RequestList } from "./components/RequestList";
import { RequestDetails } from "./components/RequestDetails";

async function fetchRequests(): Promise<CapturedRequest[]> {
  const res = await fetch("/api/requests");
  return res.json();
}

async function sendTestRequestThroughProxy(): Promise<void> {
  await fetch("/api/send-test", { method: "POST" });
}

export function Dashboard() {
  const [items, setItems] = React.useState<CapturedRequest[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [live, setLive] = React.useState(false);

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

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "460px 1fr", height: "100vh" }}>
      <div style={{ borderRight: "1px solid var(--border)", background: "var(--panel)" }}>
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
              <label
                style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--muted)", fontSize: 12 }}
              >
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
        <RequestList items={items} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div style={{ background: "var(--bg)" }}>
        <RequestDetails request={selected} onReplayed={() => void 0} />
      </div>
    </div>
  );
}
