#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "node:fs";
import { startProxyServer } from "../core/proxyServer";
import { startApiServer } from "../server/apiServer";
import { memoryStore } from "../storage/memoryStore";
import type { CapturedRequest } from "../types/capturedRequest";

const argv = await yargs(hideBin(process.argv))
  .command("start", "Start Flowly", (y) =>
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
        describe: "Comma-separated list of header names to exclude from capture (e.g. authorization,cookie)"
      })
      .option("ignorePath", {
        type: "string",
        describe: "Comma-separated list of path prefixes to skip capture (e.g. /health,/metrics)"
      })
      .option("maxBody", {
        type: "number",
        default: 200000,
        describe: "Max captured body size in bytes (truncate beyond this limit)"
      })
      .option("persist", {
        type: "string",
        describe: "Persist captured requests to a JSON file (load on start, save on shutdown)"
      })
  )
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

startProxyServer({
  port: argv.port,
  target: argv.target,
  ignoreHeaders,
  ignorePaths,
  maxBodyBytes
});
startApiServer({ port: argv.apiPort });

if (argv.persist) {
  const persistPath = argv.persist as string;
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

// eslint-disable-next-line no-console
console.log(`Flowly proxy listening on http://localhost:${argv.port} -> ${argv.target}`);
// eslint-disable-next-line no-console
console.log(`Flowly API listening on http://localhost:${argv.apiPort}`);
// eslint-disable-next-line no-console
console.log(`Dashboard dev server: http://localhost:5173`);
