import type { CapturedRequest } from "../types/capturedRequest.js";

export type Insight = NonNullable<CapturedRequest["anomalies"]>[number];

type RouteKey = string;

interface RouteStats {
  durations: number[];
  baselineP95?: number;
  lastErrorSignature?: string;
  recentErrorSignatures: Set<string>;
  recentGetCounts: Map<string, number>;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx] ?? null;
}

function safeUpper(s: string | undefined): string {
  return (s ?? "").toUpperCase();
}

function normalizePath(path: string): string {
  // Very light normalization to avoid exploding cardinality.
  // Replace obvious numeric segments with :id.
  return path
    .split("?")[0]
    .split("/")
    .map((seg) => (/^\d{2,}$/.test(seg) ? ":id" : seg))
    .join("/");
}

function routeKey(r: CapturedRequest): RouteKey {
  const p = normalizePath(r.path ?? "/");
  return `${safeUpper(r.method)} ${p}`;
}

function errorSignature(r: CapturedRequest): string | null {
  const s = r.responseStatus;
  if (typeof s !== "number" || !Number.isFinite(s) || s < 400) return null;

  const body = (r.responseBody ?? "").slice(0, 300);
  const firstLine = body.split("\n")[0] ?? "";
  return `${s}:${firstLine}`.trim();
}

export class InsightEngine {
  private readonly perRoute = new Map<RouteKey, RouteStats>();

  analyze(r: CapturedRequest): Insight[] {
    const insights: Insight[] = [];

    const key = routeKey(r);
    const st = this.perRoute.get(key) ?? {
      durations: [],
      recentErrorSignatures: new Set<string>(),
      recentGetCounts: new Map<string, number>()
    };

    // Latency anomaly + regression (based on rolling p95)
    if (typeof r.duration === "number" && Number.isFinite(r.duration) && r.duration >= 0) {
      st.durations.push(r.duration);
      if (st.durations.length > 200) st.durations.shift();

      const sorted = [...st.durations].sort((a, b) => a - b);
      const p95 = percentile(sorted, 95);

      if (p95 !== null) {
        // anomaly: single request is way above current p95
        if (r.duration > Math.max(1000, p95 * 2.5)) {
          insights.push({
            type: "latency",
            severity: r.duration > 5000 ? "critical" : "warning",
            message: `Unusual latency: ${Math.round(r.duration)}ms (route p95 ~ ${Math.round(p95)}ms)`
          });
        }

        // regression: p95 jumped relative to baseline
        if (typeof st.baselineP95 === "number" && Number.isFinite(st.baselineP95) && st.baselineP95 > 0) {
          if (p95 > st.baselineP95 * 1.5 && p95 - st.baselineP95 > 150) {
            insights.push({
              type: "regression",
              severity: "warning",
              message: `Potential performance regression: p95 ~ ${Math.round(p95)}ms (baseline ~ ${Math.round(st.baselineP95)}ms)`
            });
          }
        }

        // establish baseline after we have some data
        if (st.durations.length >= 30 && st.baselineP95 === undefined) {
          st.baselineP95 = p95;
        }
      }
    }

    // New error patterns
    const sig = errorSignature(r);
    if (sig) {
      if (!st.recentErrorSignatures.has(sig) && st.recentErrorSignatures.size >= 3) {
        insights.push({
          type: "new_error_pattern",
          severity: "warning",
          message: "New error pattern detected for this route (status/body signature differs from recent errors)"
        });
      }
      st.recentErrorSignatures.add(sig);
      if (st.recentErrorSignatures.size > 20) {
        // naive cap
        st.recentErrorSignatures = new Set(Array.from(st.recentErrorSignatures).slice(-20));
      }
    }

    // Smart caching recommendation (very basic): repeated GETs
    if (safeUpper(r.method) === "GET" && typeof r.responseStatus === "number" && r.responseStatus >= 200 && r.responseStatus < 300) {
      const urlKey = `${normalizePath(r.path ?? "/")}`;
      const count = (st.recentGetCounts.get(urlKey) ?? 0) + 1;
      st.recentGetCounts.set(urlKey, count);

      if (count === 10) {
        insights.push({
          type: "cache_recommendation",
          severity: "info",
          message: "Repeated successful GETs detected for this route. Consider caching (ETag/Cache-Control) if appropriate."
        });
      }

      if (st.recentGetCounts.size > 200) {
        // cap map size
        const first = st.recentGetCounts.keys().next().value;
        if (first) st.recentGetCounts.delete(first);
      }
    }

    this.perRoute.set(key, st);
    return insights;
  }
}
