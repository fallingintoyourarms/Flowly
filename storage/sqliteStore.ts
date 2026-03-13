import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { CapturedRequest } from "../types/capturedRequest.js";

export interface SqliteStoreOptions {
  dbPath: string;
}

export interface SqliteQueryOptions {
  q?: string;
  regex?: string;
  method?: string;
  statusMin?: number;
  statusMax?: number;
  sessionId?: string;
  tag?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function safeJsonParse<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

export class SqliteStore {
  private readonly db: Database.Database;

  constructor(opts: SqliteStoreOptions) {
    ensureDir(opts.dbPath);
    this.db = new Database(opts.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        targetUrl TEXT,
        protocol TEXT,
        contentType TEXT,
        duration INTEGER,
        responseStatus INTEGER,

        headersJson TEXT,
        rawHeadersJson TEXT,
        body TEXT,

        responseHeadersJson TEXT,
        rawResponseHeadersJson TEXT,
        responseBody TEXT,

        isWebSocket INTEGER,
        wsFramesJson TEXT,

        graphqlJson TEXT,
        grpcJson TEXT,

        sessionId TEXT,
        sessionTagsJson TEXT,
        anomaliesJson TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        tagsJson TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(sessionId);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updatedAt);
    `);
  }

  ensureSession(sessionId: string, tags: string[] = []): void {
    const now = Date.now();
    const existing = this.db
      .prepare("SELECT id, tagsJson FROM sessions WHERE id = ?")
      .get(sessionId) as { id: string; tagsJson: string } | undefined;

    if (!existing) {
      this.db
        .prepare("INSERT INTO sessions (id, createdAt, updatedAt, tagsJson) VALUES (?, ?, ?, ?)")
        .run(sessionId, now, now, safeJsonStringify(tags));
      return;
    }

    const current = safeJsonParse<string[]>(existing.tagsJson) ?? [];
    const merged = Array.from(new Set([...current, ...tags]));
    this.db
      .prepare("UPDATE sessions SET updatedAt = ?, tagsJson = ? WHERE id = ?")
      .run(now, safeJsonStringify(merged), sessionId);
  }

  upsertRequest(r: CapturedRequest): void {
    if (r.sessionId) this.ensureSession(r.sessionId, r.sessionTags ?? []);

    this.db
      .prepare(
        `
        INSERT INTO requests (
          id, timestamp, method, path, targetUrl, protocol, contentType, duration, responseStatus,
          headersJson, rawHeadersJson, body,
          responseHeadersJson, rawResponseHeadersJson, responseBody,
          isWebSocket, wsFramesJson,
          graphqlJson, grpcJson,
          sessionId, sessionTagsJson, anomaliesJson
        ) VALUES (
          @id, @timestamp, @method, @path, @targetUrl, @protocol, @contentType, @duration, @responseStatus,
          @headersJson, @rawHeadersJson, @body,
          @responseHeadersJson, @rawResponseHeadersJson, @responseBody,
          @isWebSocket, @wsFramesJson,
          @graphqlJson, @grpcJson,
          @sessionId, @sessionTagsJson, @anomaliesJson
        )
        ON CONFLICT(id) DO UPDATE SET
          timestamp = excluded.timestamp,
          method = excluded.method,
          path = excluded.path,
          targetUrl = excluded.targetUrl,
          protocol = excluded.protocol,
          contentType = excluded.contentType,
          duration = excluded.duration,
          responseStatus = excluded.responseStatus,
          headersJson = excluded.headersJson,
          rawHeadersJson = excluded.rawHeadersJson,
          body = excluded.body,
          responseHeadersJson = excluded.responseHeadersJson,
          rawResponseHeadersJson = excluded.rawResponseHeadersJson,
          responseBody = excluded.responseBody,
          isWebSocket = excluded.isWebSocket,
          wsFramesJson = excluded.wsFramesJson,
          graphqlJson = excluded.graphqlJson,
          grpcJson = excluded.grpcJson,
          sessionId = excluded.sessionId,
          sessionTagsJson = excluded.sessionTagsJson,
          anomaliesJson = excluded.anomaliesJson
        `
      )
      .run({
        id: r.id,
        timestamp: r.timestamp,
        method: r.method,
        path: r.path,
        targetUrl: r.targetUrl ?? null,
        protocol: r.protocol ?? null,
        contentType: r.contentType ?? null,
        duration: typeof r.duration === "number" && Number.isFinite(r.duration) ? Math.round(r.duration) : null,
        responseStatus: typeof r.responseStatus === "number" ? r.responseStatus : null,

        headersJson: safeJsonStringify(r.headers ?? {}),
        rawHeadersJson: safeJsonStringify(r.rawHeaders ?? null),
        body: r.body ?? null,

        responseHeadersJson: safeJsonStringify(r.responseHeaders ?? null),
        rawResponseHeadersJson: safeJsonStringify(r.rawResponseHeaders ?? null),
        responseBody: r.responseBody ?? null,

        isWebSocket: r.isWebSocket ? 1 : 0,
        wsFramesJson: safeJsonStringify(r.wsFrames ?? null),

        graphqlJson: safeJsonStringify(r.graphql ?? null),
        grpcJson: safeJsonStringify(r.grpc ?? null),

        sessionId: r.sessionId ?? null,
        sessionTagsJson: safeJsonStringify(r.sessionTags ?? null),
        anomaliesJson: safeJsonStringify(r.anomalies ?? null)
      });

    if (r.sessionId) {
      this.db.prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?").run(Date.now(), r.sessionId);
    }
  }

  queryRequests(opts: SqliteQueryOptions = {}): CapturedRequest[] {
    const where: string[] = [];
    const params: Record<string, any> = {};

    if (opts.method) {
      where.push("UPPER(method) = UPPER(@method)");
      params.method = opts.method;
    }
    if (typeof opts.statusMin === "number" && Number.isFinite(opts.statusMin)) {
      where.push("responseStatus IS NOT NULL AND responseStatus >= @statusMin");
      params.statusMin = opts.statusMin;
    }
    if (typeof opts.statusMax === "number" && Number.isFinite(opts.statusMax)) {
      where.push("responseStatus IS NOT NULL AND responseStatus <= @statusMax");
      params.statusMax = opts.statusMax;
    }
    if (opts.sessionId) {
      where.push("sessionId = @sessionId");
      params.sessionId = opts.sessionId;
    }
    if (typeof opts.since === "number" && Number.isFinite(opts.since)) {
      where.push("timestamp >= @since");
      params.since = opts.since;
    }
    if (typeof opts.until === "number" && Number.isFinite(opts.until)) {
      where.push("timestamp <= @until");
      params.until = opts.until;
    }

    const limit = typeof opts.limit === "number" && Number.isFinite(opts.limit) ? Math.max(1, Math.min(5000, opts.limit)) : 500;
    const offset = typeof opts.offset === "number" && Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0;

    const sql = `
      SELECT * FROM requests
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY timestamp DESC
      LIMIT @limit OFFSET @offset
    `;

    const rows = this.db.prepare(sql).all({ ...params, limit, offset }) as any[];

    const items = rows.map((row) => this.rowToRequest(row));

    // Post-filters that are easier in JS (q/regex/tag)
    let out = items;

    if (opts.q) {
      const needle = opts.q.toLowerCase();
      out = out.filter((r) => `${r.path}\n${r.body ?? ""}\n${r.responseBody ?? ""}`.toLowerCase().includes(needle));
    }

    if (opts.regex) {
      try {
        const re = new RegExp(opts.regex, "i");
        out = out.filter((r) => re.test(`${r.path}\n${r.body ?? ""}\n${r.responseBody ?? ""}`));
      } catch {
        // ignore invalid regex here; validation should happen at API layer
      }
    }

    if (opts.tag) {
      const tagNeedle = opts.tag.toLowerCase();
      out = out.filter((r) => (r.sessionTags ?? []).some((t) => t.toLowerCase() === tagNeedle));
    }

    return out;
  }

  listSessions(limit = 200): Array<{ id: string; createdAt: number; updatedAt: number; tags: string[] }>{
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(2000, limit)) : 200;
    const rows = this.db
      .prepare("SELECT id, createdAt, updatedAt, tagsJson FROM sessions ORDER BY updatedAt DESC LIMIT ?")
      .all(safeLimit) as Array<{ id: string; createdAt: number; updatedAt: number; tagsJson: string }>;

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      tags: safeJsonParse<string[]>(r.tagsJson) ?? []
    }));
  }

  getSession(sessionId: string): { id: string; createdAt: number; updatedAt: number; tags: string[] } | null {
    const row = this.db
      .prepare("SELECT id, createdAt, updatedAt, tagsJson FROM sessions WHERE id = ?")
      .get(sessionId) as { id: string; createdAt: number; updatedAt: number; tagsJson: string } | undefined;

    if (!row) return null;
    return { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, tags: safeJsonParse<string[]>(row.tagsJson) ?? [] };
  }

  setSessionTags(sessionId: string, tags: string[]): void {
    this.ensureSession(sessionId, tags);
  }

  private rowToRequest(row: any): CapturedRequest {
    return {
      id: String(row.id),
      timestamp: Number(row.timestamp),
      method: String(row.method),
      path: String(row.path),
      targetUrl: row.targetUrl ? String(row.targetUrl) : undefined,
      protocol: row.protocol ? (String(row.protocol) as any) : undefined,
      contentType: row.contentType ? String(row.contentType) : undefined,
      duration: row.duration === null || row.duration === undefined ? undefined : Number(row.duration),
      responseStatus: row.responseStatus === null || row.responseStatus === undefined ? undefined : Number(row.responseStatus),

      headers: safeJsonParse<Record<string, string>>(row.headersJson) ?? {},
      rawHeaders: safeJsonParse<Record<string, string>>(row.rawHeadersJson) ?? undefined,
      body: row.body === null || row.body === undefined ? undefined : String(row.body),

      responseHeaders: safeJsonParse<Record<string, string>>(row.responseHeadersJson) ?? undefined,
      rawResponseHeaders: safeJsonParse<Record<string, string>>(row.rawResponseHeadersJson) ?? undefined,
      responseBody: row.responseBody === null || row.responseBody === undefined ? undefined : String(row.responseBody),

      isWebSocket: Boolean(row.isWebSocket),
      wsFrames: safeJsonParse<any[]>(row.wsFramesJson) as any,

      graphql: safeJsonParse<any>(row.graphqlJson) as any,
      grpc: safeJsonParse<any>(row.grpcJson) as any,

      sessionId: row.sessionId ? String(row.sessionId) : undefined,
      sessionTags: safeJsonParse<string[]>(row.sessionTagsJson) ?? undefined,
      anomalies: safeJsonParse<any[]>(row.anomaliesJson) as any
    };
  }
}
