#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "node:fs";
import path from "node:path";
import { startProxyServer } from "../core/proxyServer.js";
import { startApiServer } from "../server/apiServer.js";
import { memoryStore } from "../storage/memoryStore.js";
import type { CapturedRequest } from "../types/capturedRequest.js";
import { SqliteStore } from "../storage/sqliteStore.js";

// Simple ANSI color helpers
const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`
};

const argv = await yargs(hideBin(process.argv))
  .command("start", "Start Flowly proxy and API server", (y) =>
    y
      .option("target", {
        type: "string",
        demandOption: true,
        describe: "Target API base URL (e.g. http://localhost:3000)"
      })
      .option("port", {
        type: "number",
        default: 9090,
        describe: "Proxy listen port"
      })
      .option("apiPort", {
        type: "number",
        default: 9091,
        describe: "Internal API server port for the dashboard"
      })
      .option("ignoreHeader", {
        type: "string",
        describe: "Comma-separated list of header names to exclude from capture"
      })
      .option("ignorePath", {
        type: "string",
        describe: "Comma-separated list of path prefixes to skip capture"
      })
      .option("maxBody", {
        type: "number",
        default: 200000,
        describe: "Max captured body size in bytes"
      })
      .option("persist", {
        type: "string",
        describe: "Persist captured requests to a JSON file"
      })
      .option("traceDb", {
        type: "string",
        default: path.join(process.cwd(), ".flowly", "traces.db"),
        describe: "Persist traces to a SQLite database file"
      })
      .option("maxInMemory", {
        type: "number",
        default: 500,
        describe: "Max captured requests to keep in RAM (older items remain queryable in SQLite)"
      })
  )
  .command("version", "Show version", () => {
    console.log("0.1.5");
    process.exit(0);
  })
  .help()
  .parse();

const ignoreHeaders = (argv.ignoreHeader ? String(argv.ignoreHeader) : "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ignorePaths = (argv.ignorePath ? String(argv.ignorePath) : "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const maxBodyBytes = typeof argv.maxBody === "number" ? argv.maxBody : Number(argv.maxBody);

const cmd = (argv._[0] as string | undefined) ?? "start";
if (cmd !== "start") {
  process.exitCode = 1;
  throw new Error(`Unknown command: ${cmd}`);
}

const traceDbPath = argv.traceDb ? String(argv.traceDb) : path.join(process.cwd(), ".flowly", "traces.db");
const sqlite = new SqliteStore({ dbPath: traceDbPath });

// Session state lives with the server process.
// Default session is created at startup.
const currentSessionId = crypto.randomUUID();
sqlite.ensureSession(currentSessionId, []);

let currentSessionTags: string[] = [];

memoryStore.configure({
  maxInMemory: Number(argv.maxInMemory),
  persistence: {
    upsertRequest: (r) => sqlite.upsertRequest(r),
    clearAll: () => {
      // keep history by default; clearing RAM should not wipe DB
    },
    replaceAll: (items) => {
      for (const r of items) sqlite.upsertRequest(r);
    }
  }
});

startProxyServer({
  port: Number(argv.port),
  target: String(argv.target),
  ignoreHeaders,
  ignorePaths,
  maxBodyBytes,
  getCurrentSession: () => ({ id: currentSessionId, tags: currentSessionTags })
});

startApiServer({
  port: Number(argv.apiPort),
  sqlite,
  getCurrentSessionId: () => currentSessionId,
  setCurrentSessionTags: (tags: unknown) => {
    currentSessionTags = Array.isArray(tags) ? tags.map(String).filter(Boolean) : [];
    sqlite.setSessionTags(currentSessionId, currentSessionTags);
  },
  getCurrentSessionTags: () => currentSessionTags
});

const persistPath = argv.persist ? String(argv.persist) : null;

if (persistPath) {
  try {
    if (fs.existsSync(persistPath)) {
      const raw = fs.readFileSync(persistPath, "utf8");
      const parsed = JSON.parse(raw) as CapturedRequest[];
      if (Array.isArray(parsed)) memoryStore.replaceAll(parsed);
    }
  } catch {
    // ignore load errors
  }

  const save = () => {
    try {
      fs.writeFileSync(persistPath, JSON.stringify(memoryStore.all(), null, 2), "utf8");
    } catch {
      // ignore save errors
    }
  };

  process.on("SIGINT", () => {
    save();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    save();
    process.exit(0);
  });
  process.on("exit", () => save());
}

console.log("");
console.log(c.bold(c.cyan("    Flowly")) + c.dim("  Local API traffic debugger"));
console.log("");
console.log(c.dim("  Proxy:    ") + c.green(`http://localhost:${argv.port}`) + c.dim(` → ${argv.target}`));
console.log(c.dim("  API:      ") + c.green(`http://localhost:${argv.apiPort}`));
console.log(c.dim("  Capture:  ") + c.yellow(`${argv.maxBody?.toLocaleString() ?? 200000} bytes max`));
console.log(c.dim("  Trace DB: ") + c.yellow(traceDbPath));
console.log(c.dim("  Session:  ") + c.yellow(currentSessionId));
if (persistPath) console.log(c.dim("  Persist:  ") + c.yellow(persistPath));
if (ignoreHeaders.length) console.log(c.dim("  Ignore:   ") + c.yellow(ignoreHeaders.join(", ")));
if (ignorePaths.length) console.log(c.dim("  Skip:     ") + c.yellow(ignorePaths.join(", ")));
console.log("");
console.log(c.dim("  Press Ctrl+C to stop"));
console.log("");
