import type { CapturedRequest } from "../types/capturedRequest.js";

type StoreEvent =
  | { type: "request_added"; request: CapturedRequest }
  | { type: "request_updated"; id: string; patch: Partial<CapturedRequest> }
  | { type: "cleared" }
  | { type: "paused"; paused: boolean };

export interface StorePersistenceAdapter {
  upsertRequest: (r: CapturedRequest) => void;
  clearAll?: () => void;
  replaceAll?: (items: CapturedRequest[]) => void;
}

/**
 * Simple in-memory store for captured requests.
 *
 * Responsibilities:
 * - Create requests when they enter the proxy
 * - Update requests when a response is received
 * - Retrieve requests for the dashboard
 */
class MemoryStore {
  private readonly requests = new Map<string, CapturedRequest>();
  private readonly order: string[] = [];
  private max = 500;
  private paused = false;
  private listeners = new Set<(evt: StoreEvent) => void>();

  private persistence?: StorePersistenceAdapter;

  configure(opts: { maxInMemory?: number; persistence?: StorePersistenceAdapter }): void {
    if (typeof opts.maxInMemory === "number" && Number.isFinite(opts.maxInMemory)) {
      this.max = Math.max(50, Math.min(50000, Math.floor(opts.maxInMemory)));
    }
    this.persistence = opts.persistence;
  }

  subscribe(listener: (evt: StoreEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(evt: StoreEvent): void {
    for (const l of this.listeners) l(evt);
  }

  setPaused(paused: boolean): void { 
    this.paused = paused;
    this.emit({ type: "paused", paused });
  }

  isPaused(): boolean { 
    return this.paused;
  }
  
  clear(): void {
    this.requests.clear();
    this.order.length = 0;
    this.persistence?.clearAll?.();
    this.emit({ type: "cleared" });
  }

  replaceAll(requests: CapturedRequest[]): void {
    this.requests.clear();
    this.order.length = 0;

    for (const r of requests) {
      this.requests.set(r.id, r);
      this.order.push(r.id);
    }

    // Keep newest first, and enforce cap.
    this.order.sort((a, b) => {
      const ra = this.requests.get(a);
      const rb = this.requests.get(b);
      return (rb?.timestamp ?? 0) - (ra?.timestamp ?? 0);
    });

    while (this.order.length > this.max) {
      const oldestId = this.order.pop();
      if (oldestId) this.requests.delete(oldestId);
    }

    this.emit({ type: "cleared" });
    for (const id of this.order) {
      const r = this.requests.get(id);
      if (r) this.emit({ type: "request_added", request: r });
    }

    this.persistence?.replaceAll?.(this.all());
  }

  /**
   * Stores a newly captured request.
   *
   * @param req A partially or fully captured request object
   */
  add(req: CapturedRequest): void {
    if (this.paused) return;
    this.requests.set(req.id, req);
    this.order.unshift(req.id);
    this.emit({ type: "request_added", request: req });

    this.persistence?.upsertRequest(req);

    while (this.order.length > this.max) {
      const oldestId = this.order.pop();
      if (oldestId) this.requests.delete(oldestId);
    }
  }

  /**
   * Updates an existing captured request.
   *
   * @param id Request ID to update
   * @param patch Fields to merge into the stored request
   */
  update(id: string, patch: Partial<CapturedRequest>): void {
    const existing = this.requests.get(id);
    if (!existing) return;
    const next = { ...existing, ...patch };
    this.requests.set(id, next);
    this.emit({ type: "request_updated", id, patch });

    this.persistence?.upsertRequest(next);
  }

  /**
   * Returns all captured requests in reverse-chronological order.
   */
  all(): CapturedRequest[] {
    return this.order
      .map((id) => this.requests.get(id))
      .filter((r): r is CapturedRequest => Boolean(r));
  }

  /**
   * Returns a captured request by its ID.
   *
   * @param id Request ID
   */
  get(id: string): CapturedRequest | undefined {
    return this.requests.get(id);
  }
}

export const memoryStore = new MemoryStore();
