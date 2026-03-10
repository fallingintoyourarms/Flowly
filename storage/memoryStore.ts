import type { CapturedRequest } from "../types/capturedRequest";

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
  private paused = false;

  setPaused(paused: boolean): void { 
    this.paused = paused;
  }

  isPaused(): boolean { 
    return this.paused;
  }
  
  clear(): void {
    this.requests.clear();
    this.order.length = 0;
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
    this.requests.set(id, { ...existing, ...patch });
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
