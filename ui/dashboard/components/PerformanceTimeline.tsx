import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../src/components/ui/card.js";
import { Badge } from "../../src/components/ui/badge.js";
import { Button } from "../../src/components/ui/button.js";
import { Input } from "../../src/components/ui/input.js";

type TimelineItem = {
  id: string;
  method: string;
  path: string;
  group: string;
  ts: number;
  duration: number;
  status: number | null;
  protocol: string;
};

type TimelineResponse = {
  ok: boolean;
  sessionId: string;
  window: { start: number; end: number; totalMs: number } | null;
  items: TimelineItem[];
};

type SlowEndpointRow = { route: string; count: number; p50: number | null; p95: number | null; avg: number };

type SlowEndpointsResponse = { ok: boolean; sessionId: string; items: SlowEndpointRow[] };

type NPlus1Item = { route: string; start: number; end: number; count: number; ids: string[] };

type NPlus1Response = { ok: boolean; sessionId: string; windowMs: number; minCount: number; items: NPlus1Item[] };

type CriticalNode = { id: string; start: number; end: number; method: string; path: string; group: string };

type CriticalPathResponse = { ok: boolean; sessionId: string; totalMs: number; path: CriticalNode[] };

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function statusVariant(status: number | null): "muted" | "warn" | "danger" | "success" {
  if (typeof status !== "number") return "muted";
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "warn";
  if (status >= 500) return "danger";
  return "muted";
}

async function fetchCurrentSessionId(): Promise<string | null> {
  try {
    const res = await fetch("/api/sessions/current");
    const json = await res.json();
    return typeof json?.sessionId === "string" ? json.sessionId : null;
  } catch {
    return null;
  }
}

async function fetchTimeline(sessionId: string): Promise<TimelineResponse> {
  const res = await fetch(`/api/performance/timeline?sessionId=${encodeURIComponent(sessionId)}`);
  return res.json();
}

async function fetchSlowEndpoints(sessionId: string, limit: number): Promise<SlowEndpointsResponse> {
  const res = await fetch(`/api/performance/slow-endpoints?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`);
  return res.json();
}

async function fetchNPlus1(sessionId: string, windowMs: number, minCount: number): Promise<NPlus1Response> {
  const sp = new URLSearchParams({ sessionId, windowMs: String(windowMs), minCount: String(minCount) });
  const res = await fetch(`/api/performance/nplus1?${sp.toString()}`);
  return res.json();
}

async function fetchCriticalPath(sessionId: string): Promise<CriticalPathResponse> {
  const res = await fetch(`/api/performance/critical-path?sessionId=${encodeURIComponent(sessionId)}`);
  return res.json();
}

export function PerformanceTimeline(props: { onSelectRequestId: (id: string) => void }) {
  const [sessionId, setSessionId] = React.useState<string>("");
  const [autoSessionId, setAutoSessionId] = React.useState<string | null>(null);

  const [timeline, setTimeline] = React.useState<TimelineResponse | null>(null);
  const [slow, setSlow] = React.useState<SlowEndpointsResponse | null>(null);
  const [n1, setN1] = React.useState<NPlus1Response | null>(null);
  const [critical, setCritical] = React.useState<CriticalPathResponse | null>(null);

  const [slowLimit, setSlowLimit] = React.useState(15);
  const [n1WindowMs, setN1WindowMs] = React.useState(1500);
  const [n1MinCount, setN1MinCount] = React.useState(6);

  React.useEffect(() => {
    void (async () => {
      const id = await fetchCurrentSessionId();
      setAutoSessionId(id);
      if (!sessionId && id) setSessionId(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = React.useCallback(async () => {
    if (!sessionId) return;
    const [t, s, n, c] = await Promise.all([
      fetchTimeline(sessionId),
      fetchSlowEndpoints(sessionId, slowLimit),
      fetchNPlus1(sessionId, n1WindowMs, n1MinCount),
      fetchCriticalPath(sessionId)
    ]);
    setTimeline(t);
    setSlow(s);
    setN1(n);
    setCritical(c);
  }, [sessionId, slowLimit, n1WindowMs, n1MinCount]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = timeline?.items ?? [];
  const window = timeline?.window;

  const groups = React.useMemo(() => {
    const m = new Map<string, TimelineItem[]>();
    for (const it of items) {
      const arr = m.get(it.group) ?? [];
      arr.push(it);
      m.set(it.group, arr);
    }
    return Array.from(m.entries())
      .map(([group, arr]) => ({ group, arr: arr.sort((a, b) => a.ts - b.ts) }))
      .sort((a, b) => b.arr.length - a.arr.length);
  }, [items]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Performance Timeline</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="sessionId" className="max-w-[520px]" />
            {autoSessionId && (
              <Button variant="secondary" size="sm" onClick={() => setSessionId(autoSessionId)}>
                Use current
              </Button>
            )}
            {window && <Badge variant="muted">span: {fmtMs(window.totalMs)}</Badge>}
            <Badge variant="muted">items: {items.length}</Badge>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input
              value={String(slowLimit)}
              onChange={(e) => setSlowLimit(Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
              placeholder="slow endpoints limit"
            />
            <Input
              value={String(n1WindowMs)}
              onChange={(e) => setN1WindowMs(Math.max(200, Math.min(10000, Number(e.target.value) || 1500)))}
              placeholder="n+1 windowMs"
            />
            <Input
              value={String(n1MinCount)}
              onChange={(e) => setN1MinCount(Math.max(3, Math.min(100, Number(e.target.value) || 6)))}
              placeholder="n+1 minCount"
            />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Slow endpoints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(slow?.items ?? []).length === 0 ? (
              <div className="text-muted-foreground">No data</div>
            ) : (
              (slow?.items ?? []).map((row) => (
                <div key={row.route} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate font-mono text-xs">{row.route}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="muted">n: {row.count}</Badge>
                    <Badge variant="muted">p50: {row.p50 !== null ? fmtMs(row.p50) : "-"}</Badge>
                    <Badge variant="warn">p95: {row.p95 !== null ? fmtMs(row.p95) : "-"}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>N+1 suspects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(n1?.items ?? []).length === 0 ? (
              <div className="text-muted-foreground">No suspects</div>
            ) : (
              (n1?.items ?? []).slice(0, 20).map((row, idx) => (
                <div key={`${row.route}-${idx}`} className="space-y-1 rounded-md border bg-muted/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-mono text-xs">{row.route}</div>
                    <Badge variant="warn">count: {row.count}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">window: {fmtMs(row.end - row.start)}</div>
                  <div className="flex flex-wrap gap-2">
                    {row.ids.slice(0, 8).map((id) => (
                      <Button key={id} variant="ghost" size="sm" onClick={() => props.onSelectRequestId(id)}>
                        {id.slice(0, 6)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Critical path</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {critical?.path?.length ? (
              <>
                <Badge variant="muted">total: {fmtMs(critical.totalMs)}</Badge>
                <div className="space-y-2">
                  {critical.path.slice(0, 20).map((n) => (
                    <div key={n.id} className="flex items-center justify-between gap-2">
                      <Button variant="ghost" size="sm" onClick={() => props.onSelectRequestId(n.id)}>
                        {n.method} {n.path}
                      </Button>
                      <Badge variant="muted">{fmtMs(n.end - n.start)}</Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">No path</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline (Gantt)</CardTitle>
        </CardHeader>
        <CardContent>
          {!window ? (
            <div className="text-sm text-muted-foreground">No data (need a session with completed requests)</div>
          ) : (
            <div className="space-y-2">
              {groups.slice(0, 30).map(({ group, arr }) => (
                <div key={group} className="rounded-md border bg-muted/10 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-mono text-xs">{group}</div>
                    <Badge variant="muted">{arr.length}</Badge>
                  </div>

                  <div className="relative h-8 overflow-hidden rounded-md border bg-background">
                    {arr.map((it) => {
                      const leftPct = ((it.ts - window.start) / Math.max(1, window.totalMs)) * 100;
                      const widthPct = (it.duration / Math.max(1, window.totalMs)) * 100;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          title={`${it.method} ${it.path} (${fmtMs(it.duration)})`}
                          onClick={() => props.onSelectRequestId(it.id)}
                          className="absolute top-1 h-6 rounded-sm border px-1 text-left text-[10px] text-foreground/90"
                          style={{
                            left: `${leftPct}%`,
                            width: `${Math.max(0.5, widthPct)}%`,
                            background: "rgba(96,165,250,0.20)",
                            borderColor: "rgba(96,165,250,0.45)"
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{it.method}</span>
                            <span className="truncate">{fmtMs(it.duration)}</span>
                          </div>
                          <div className="mt-[-2px] flex items-center gap-2">
                            <Badge variant={statusVariant(it.status)} className="h-4 px-1 text-[10px]">
                              {it.status ?? "-"}
                            </Badge>
                            <span className="truncate opacity-70">{it.path}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
