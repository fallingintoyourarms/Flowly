import React from "react";
import type { CapturedRequest } from "../../types/capturedRequest.js";
import { RequestList } from "./components/RequestList.js";
import { RequestDetails } from "./components/RequestDetails.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../src/components/ui/tabs.js";
import { Badge } from "../src/components/ui/badge.js";
import { Button } from "../src/components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../src/components/ui/card.js";
import { Input } from "../src/components/ui/input.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../src/components/ui/tooltip.js";
import { Github, Settings, Activity, List, Pause, Trash2, Send, Upload } from "lucide-react";

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

function sumRecord(rec: Record<string, number> | undefined): number {
  if (!rec) return 0;
  let total = 0;
  for (const v of Object.values(rec)) total += typeof v === "number" ? v : 0;
  return total;
}

function useEventSource(on: {
  onLive: (live: boolean) => void;
  onRequestAdded: (req: CapturedRequest) => void;
  onRequestUpdated: (id: string, patch: Partial<CapturedRequest>) => void;
  onCleared: () => void;
  onPaused: (paused: boolean) => void;
}) {
  React.useEffect(() => {
    const es = new EventSource("/api/events");

    const onOpen = () => on.onLive(true);
    const onErr = () => on.onLive(false);

    const onAdded = (e: Event) => {
      const msg = JSON.parse((e as MessageEvent).data);
      const req = msg.request as CapturedRequest;
      on.onRequestAdded(req);
    };

    const onUpdated = (e: Event) => {
      const msg = JSON.parse((e as MessageEvent).data) as { id: string; patch: Partial<CapturedRequest> };
      on.onRequestUpdated(msg.id, msg.patch);
    };

    const onCleared = () => on.onCleared();

    const onPaused = (e: Event) => {
      const msg = JSON.parse((e as MessageEvent).data) as { paused: boolean };
      on.onPaused(Boolean(msg.paused));
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onErr);
    es.addEventListener("request_added", onAdded);
    es.addEventListener("request_updated", onUpdated);
    es.addEventListener("cleared", onCleared);
    es.addEventListener("paused", onPaused);

    return () => {
      es.close();
    };
  }, [on]);
}

function useInterval(callback: () => void, delayMs: number | null) {
  const cbRef = React.useRef(callback);
  cbRef.current = callback;

  React.useEffect(() => {
    if (delayMs === null) return;
    const t = window.setInterval(() => cbRef.current(), delayMs);
    return () => window.clearInterval(t);
  }, [delayMs]);
}

function useDebouncedEffect(effect: () => void, delayMs: number, deps: React.DependencyList) {
  React.useEffect(() => {
    const t = window.setTimeout(effect, delayMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function StatusDistribution(props: { analytics: AnalyticsOverview }) {
  const { analytics } = props;
  const total = React.useMemo(() => sumRecord(analytics.statusCounts), [analytics.statusCounts]);
  const parts = React.useMemo(
    () =>
      [
        { key: "2xx", color: "var(--green)" },
        { key: "3xx", color: "var(--blue)" },
        { key: "4xx", color: "var(--yellow)" },
        { key: "5xx", color: "var(--red)" },
        { key: "other", color: "var(--muted)" }
      ] as const,
    []
  );

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel2)", borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Status distribution (last {analytics.windowSec}s)</div>
      <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.04)" }}>
        {parts.map((p) => {
          const n = analytics.statusCounts[p.key] ?? 0;
          const pct = total > 0 ? (n / total) * 100 : 0;
          return <div key={p.key} style={{ width: `${pct}%`, background: p.color }} title={`${p.key}: ${n}`} />;
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {parts.map((p) => (
          <span key={p.key} className="badge">
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: p.color, marginRight: 6, verticalAlign: "middle" }} />
            {p.key}: {analytics.statusCounts[p.key] ?? 0}
          </span>
        ))}
      </div>
    </div>
  );
}

function LatencyHistogram(props: { analytics: AnalyticsOverview }) {
  const { analytics } = props;
  const max = React.useMemo(() => Math.max(1, ...analytics.latencyHistogram.map((x) => x.count)), [analytics.latencyHistogram]);

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel2)", borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Latency histogram (ms)</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
        {analytics.latencyHistogram.map((b, i) => {
          const h = Math.round((b.count / max) * 60);
          const label = b.max === Infinity ? `${b.min}+` : `${b.min}-${b.max}`;
          return (
            <div key={i} style={{ flex: 1, minWidth: 0 }} title={`${label}ms: ${b.count}`}>
              <div style={{ height: h, background: "rgba(96,165,250,0.5)", border: "1px solid rgba(96,165,250,0.7)", borderRadius: 6 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--muted)" }}>
        <span>fast</span>
        <span>slow</span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [items, setItems] = React.useState<CapturedRequest[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [live, setLive] = React.useState(false);
  const [tab, setTab] = React.useState<"requests" | "analytics" | "settings">("requests");

  const [compareAId, setCompareAId] = React.useState<string | null>(null);
  const [compareBId, setCompareBId] = React.useState<string | null>(null);

  const [filterMethod, setFilterMethod] = React.useState<string>("");
  const [filterStatusMin, setFilterStatusMin] = React.useState<string>("");
  const [filterStatusMax, setFilterStatusMax] = React.useState<string>("");
  const [filterQ, setFilterQ] = React.useState<string>("");
  const [filterRegex, setFilterRegex] = React.useState<string>("");
  const [analytics, setAnalytics] = React.useState<AnalyticsOverview | null>(null);

  const hasActiveFilter = Boolean(
    filterMethod || filterStatusMin || filterStatusMax || filterQ || filterRegex
  );

  const refreshRequests = React.useCallback(async () => {
    const data = await fetchRequests();
    setItems(data);
    setSelectedId((prev) => prev ?? data[0]?.id ?? null);
  }, []);

  const refreshQuery = React.useCallback(async () => {
    if (!hasActiveFilter) return;
    const data = await fetchQuery({
      method: filterMethod || undefined,
      statusMin: filterStatusMin || undefined,
      statusMax: filterStatusMax || undefined,
      q: filterQ || undefined,
      regex: filterRegex || undefined
    });
    setItems(data);
    setSelectedId((prev) => prev ?? data[0]?.id ?? null);
  }, [hasActiveFilter, filterMethod, filterStatusMin, filterStatusMax, filterQ, filterRegex]);

  const refreshAnalytics = React.useCallback(async () => {
    try {
      const a = await fetchAnalytics();
      setAnalytics(a);
    } catch {
      setAnalytics(null);
    }
  }, []);

  React.useEffect(() => {
    refreshRequests();
  }, [refreshRequests]);

  useEventSource({
    onLive: setLive,
    onRequestAdded: (req) => {
      setItems((prev) => [req, ...prev]);
      setSelectedId((prevSel) => prevSel ?? req.id);
    },
    onRequestUpdated: (id, patch) => {
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    onCleared: () => {
      setItems([]);
      setSelectedId(null);
    },
    onPaused: setPaused
  });

  useInterval(refreshAnalytics, 1000);
  useDebouncedEffect(() => {
    if (hasActiveFilter) {
      refreshQuery();
    } else {
      refreshRequests();
    }
  }, 150, [hasActiveFilter, refreshQuery, refreshRequests]);

  const togglePaused = React.useCallback(async (next: boolean) => {
    setPaused(next);
    await fetch("/api/pause", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: next })
    });
  }, []);

  const clearAll = React.useCallback(async () => {
    await fetch("/api/clear", { method: "POST" });
  }, []);

  const selected = React.useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const compareA = React.useMemo(() => items.find((i) => i.id === compareAId) ?? null, [items, compareAId]);
  const compareB = React.useMemo(() => items.find((i) => i.id === compareBId) ?? null, [items, compareBId]);

  const pinnedIds = React.useMemo(() => new Set([compareAId, compareBId].filter(Boolean) as string[]), [compareAId, compareBId]);
  const canPinMore = pinnedIds.size < 2;

  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const importTraceFromFile = React.useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);

    await fetch("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed)
    });
  }, []);

  const onResetFilters = React.useCallback(() => {
    setFilterMethod("");
    setFilterStatusMin("");
    setFilterStatusMax("");
    setFilterQ("");
    setFilterRegex("");
  }, []);

  const onTogglePin = React.useCallback(
    (req: CapturedRequest) => {
      if (pinnedIds.has(req.id)) {
        if (compareAId === req.id) setCompareAId(null);
        if (compareBId === req.id) setCompareBId(null);
        return;
      }

      if (!canPinMore) return;
      if (!compareAId) setCompareAId(req.id);
      else if (!compareBId) setCompareBId(req.id);
    },
    [pinnedIds, compareAId, compareBId, canPinMore]
  );

  const onReplayed = React.useCallback(() => {
    if (hasActiveFilter) {
      refreshQuery();
      return;
    }
    refreshRequests();
  }, [hasActiveFilter, refreshQuery, refreshRequests]);

  return (
    <TooltipProvider>
      <div className="h-full bg-background">
        <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-card shadow-soft/10">
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold tracking-tight">Flowly</div>
                  <Badge variant={live ? "success" : "danger"}>{live ? "live" : "offline"}</Badge>
                  <Badge variant="muted">{items.length}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">Local API traffic debugger</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={paused ? "secondary" : "outline"} size="sm" onClick={() => void togglePaused(!paused)}>
                    <Pause className="h-4 w-4" />
                    {paused ? "Paused" : "Pause"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle live capture</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => void clearAll()}>
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear captured requests</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => void sendTestRequestThroughProxy()}>
                    <Send className="h-4 w-4" />
                    Test
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send test request through proxy</TooltipContent>
              </Tooltip>

              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importTraceFromFile(f);
                  e.currentTarget.value = "";
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} aria-label="Import JSON">
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import JSON trace</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <a href="https://github.com/fallingintoyourarms/Flowly" target="_blank" rel="noreferrer">
                    <Button variant="outline" size="icon" aria-label="GitHub">
                      <Github className="h-4 w-4" />
                    </Button>
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open GitHub</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="mx-auto max-w-[1600px] px-4 pb-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="requests">
                  <List className="mr-2 h-4 w-4" />
                  Requests
                </TabsTrigger>
                <TabsTrigger value="analytics">
                  <Activity className="mr-2 h-4 w-4" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="mx-auto grid h-[calc(100vh-124px)] max-w-[1600px] grid-cols-[460px_1fr] gap-4 px-4 py-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="contents">
            <TabsContent value="requests" className="contents">
              <Card className="flex min-h-0 flex-col overflow-hidden">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Capture</CardTitle>
                    <Button variant="ghost" size="sm" onClick={onResetFilters}>
                      Reset
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={filterMethod}
                      onChange={(e) => setFilterMethod(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All methods</option>
                      {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Keyword" />
                    <Input value={filterStatusMin} onChange={(e) => setFilterStatusMin(e.target.value)} placeholder="Status min" />
                    <Input value={filterStatusMax} onChange={(e) => setFilterStatusMax(e.target.value)} placeholder="Status max" />
                  </div>
                  <Input value={filterRegex} onChange={(e) => setFilterRegex(e.target.value)} placeholder="Regex" />

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="muted">rps: {analytics ? analytics.rps.toFixed(2) : "-"}</Badge>
                    <Badge variant="muted">avg: {analytics?.avgResponseMs !== null && analytics?.avgResponseMs !== undefined ? `${Math.round(analytics.avgResponseMs)}ms` : "-"}</Badge>
                    <Badge variant="warn">4xx: {analytics ? analytics.statusCounts["4xx"] ?? 0 : "-"}</Badge>
                    <Badge variant="danger">5xx: {analytics ? analytics.statusCounts["5xx"] ?? 0 : "-"}</Badge>
                    {hasActiveFilter && <Badge variant="secondary">filtered</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 p-0">
                  <div className="h-full overflow-auto">
                    <RequestList
                      items={items}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      pinnedIds={pinnedIds}
                      canPinMore={canPinMore}
                      onTogglePin={onTogglePin}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="min-h-0 overflow-hidden rounded-xl border bg-card">
                {compareA && compareB ? (
                  <div className="h-full overflow-auto p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">Compare</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          A: {compareA.method} {compareA.path} · B: {compareB.method} {compareB.path}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => {
                        setCompareAId(null);
                        setCompareBId(null);
                      }}>
                        Clear compare
                      </Button>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>A</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Request headers</div>
                            <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{JSON.stringify(compareA.rawHeaders ?? compareA.headers ?? {}, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Request body</div>
                            <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{compareA.body || "(empty)"}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Response</div>
                            <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{compareA.responseBody || "(empty)"}</pre>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>B</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Request headers</div>
                            <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{JSON.stringify(compareB.rawHeaders ?? compareB.headers ?? {}, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Request body</div>
                            <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{compareB.body || "(empty)"}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Response</div>
                            <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{compareB.responseBody || "(empty)"}</pre>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <div className="h-full overflow-auto">
                    <RequestDetails request={selected ?? null} onReplayed={onReplayed} />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Status Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics ? <StatusDistribution analytics={analytics} /> : <div className="text-sm text-muted-foreground">No analytics yet.</div>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Latency Histogram</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics ? <LatencyHistogram analytics={analytics} /> : <div className="text-sm text-muted-foreground">No analytics yet.</div>}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div>UI is now running Tailwind + shadcn-style components.</div>
                  <div>Proxy listens on :9090 and API on :9091 (see CLI output).</div>
                  <div>GitHub: https://github.com/fallingintoyourarms/Flowly</div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default Dashboard;
