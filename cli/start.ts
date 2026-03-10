#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { startProxyServer } from "../core/proxyServer";
import { startApiServer } from "../server/apiServer";

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
  )
  .help()
  .parse();

const cmd = (argv._[0] as string | undefined) ?? "start";
if (cmd !== "start") {
  process.exitCode = 1;
  throw new Error(`Unknown command: ${cmd}`);
}

startProxyServer({ port: argv.port, target: argv.target });
startApiServer({ port: argv.apiPort });

// eslint-disable-next-line no-console
console.log(`Flowly proxy listening on http://localhost:${argv.port} -> ${argv.target}`);
// eslint-disable-next-line no-console
console.log(`Flowly API listening on http://localhost:${argv.apiPort}`);
// eslint-disable-next-line no-console
console.log(`Dashboard dev server: http://localhost:5173`);
