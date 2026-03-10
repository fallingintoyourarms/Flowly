import React from "react";
import type { CapturedRequest } from "../../types/capturedRequest";
import { RequestList } from "./components/RequestList";
import { RequestDetails } from "./components/RequestDetails";

async function fetchRequests(): Promise<CapturedRequest[]> {
  const res = await fetch("/api/requests");
  return res.json();
}

async function sendTestRequestThroughProxy(): Promise<void> {
  // The UI runs on :5173, so requests to :9090 are cross-origin.
  await fetch("http://127.0.0.1:9090/flowly/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "dev-test-key"
    },
    body: JSON.stringify({ source: "flowly-dashboard", ts: Date.now() })
  });
}

export function Dashboard() {
  const [items, setItems] = React.useState<CapturedRequest[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;

    const tick = async () => {
      const data = await fetchRequests();
      if (!alive) return;
      setItems(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    };

    tick();
    const t = window.setInterval(tick, 750);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [selectedId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "460px 1fr", height: "100vh" }}>
      <div style={{ borderRight: "1px solid var(--border)", background: "var(--panel)" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>Flowly</div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Local API traffic debugger</div>
            </div>
            <button className="button" onClick={() => void sendTestRequestThroughProxy()}>
              Send test request
            </button>
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
