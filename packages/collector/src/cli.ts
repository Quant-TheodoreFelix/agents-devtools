#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_INGEST_PORT,
  DEFAULT_UI_PORT
} from "@agents-devtools/protocol";
import { createCollector, type Collector } from "./server";
import { createUiServer, type UiServer } from "./static";

type CliArgs = {
  port: number;
  uiPort: number;
  host: string;
  record?: string;
  bufferSize: number;
  open: boolean;
  help: boolean;
};

const HELP = `agents-devtools — local DevTools for Cloudflare Agents SDK

Usage: agents-devtools [options]

Options:
  -p, --port <n>         ingest port (default ${DEFAULT_INGEST_PORT}, auto-increments if busy)
      --ui-port <n>      UI port (default ${DEFAULT_UI_PORT}, auto-increments if busy)
      --host <addr>      bind address (default 127.0.0.1)
      --record <file>    append events to an NDJSON session file
      --buffer-size <n>  ring buffer capacity (default 50000)
      --no-open          do not open the browser
  -h, --help             show this help
`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    port: DEFAULT_INGEST_PORT,
    uiPort: DEFAULT_UI_PORT,
    host: "127.0.0.1",
    bufferSize: 50_000,
    open: true,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => {
      i += 1;
      const value = argv[i];
      if (value === undefined) {
        console.error(`missing value for ${arg}`);
        process.exit(1);
      }
      return value;
    };
    switch (arg) {
      case "-p":
      case "--port":
        args.port = Number.parseInt(next(), 10);
        break;
      case "--ui-port":
        args.uiPort = Number.parseInt(next(), 10);
        break;
      case "--host":
        args.host = next();
        break;
      case "--record":
        args.record = next();
        break;
      case "--buffer-size":
        args.bufferSize = Number.parseInt(next(), 10);
        break;
      case "--no-open":
        args.open = false;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        console.error(`unknown option: ${arg}`);
        process.exit(1);
    }
  }
  return args;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function toolVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8")
    ) as { version?: string };
    return `agents-devtools@${pkg.version ?? "dev"}`;
  } catch {
    return "agents-devtools@dev";
  }
}

function findUiRoot(): string | null {
  const candidates = [
    join(packageRoot, "ui-dist"),
    join(packageRoot, "..", "ui", "dist")
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) return candidate;
  }
  return null;
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const commandArgs =
    process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, commandArgs, { stdio: "ignore", detached: true }).unref();
  } catch {}
}

async function withPortFallback<T>(
  basePort: number,
  attempts: number,
  start: (port: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let offset = 0; offset < attempts; offset++) {
    try {
      return await start(basePort + offset);
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") throw error;
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  if (args.host !== "127.0.0.1" && args.host !== "localhost") {
    console.warn(
      `[warn] binding to ${args.host} exposes collected events beyond this machine. The collector has no authentication; only do this on a trusted network.`
    );
  }

  const collector: Collector = await withPortFallback(args.port, 20, (port) =>
    createCollector({
      host: args.host,
      port,
      bufferSize: args.bufferSize,
      recordPath: args.record,
      tool: toolVersion()
    })
  );

  const uiRoot = findUiRoot();
  const ui: UiServer = await withPortFallback(args.uiPort, 20, (port) =>
    createUiServer({
      root: uiRoot,
      host: args.host,
      port,
      config: { ingestHost: collector.host, ingestPort: collector.port }
    })
  );

  const uiUrl = `http://${ui.host}:${ui.port}`;
  console.log("");
  console.log("  agents-devtools");
  console.log(`  ingest   http://${collector.host}:${collector.port}/ingest`);
  console.log(`  ui       ${uiUrl}`);
  if (args.record !== undefined) console.log(`  record   ${args.record}`);
  if (uiRoot === null) console.log("  [warn] UI build not found, serving placeholder");
  if (collector.port !== args.port) {
    console.log(
      `  [warn] port ${args.port} was busy, ingest moved to ${collector.port} — pass devtools({ endpoint: "http://127.0.0.1:${collector.port}/ingest" }) in your agent`
    );
  }
  console.log("");

  if (args.open) openBrowser(uiUrl);

  const shutdown = async () => {
    await Promise.allSettled([collector.close(), ui.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
