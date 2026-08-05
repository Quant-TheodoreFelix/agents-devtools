import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2"
};

const PLACEHOLDER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>agents-devtools</title></head>
<body style="font-family: system-ui; background: #111; color: #ddd; padding: 2rem">
<h1>agents-devtools</h1>
<p>UI build not found. Run <code>pnpm --filter @agents-devtools/ui build</code> and restart.</p>
</body></html>`;

export type UiServerOptions = {
  root: string | null;
  host?: string;
  port?: number;
  config: {
    ingestHost: string;
    ingestPort: number;
  };
};

export type UiServer = {
  server: Server;
  host: string;
  port: number;
  close(): Promise<void>;
};

export function createUiServer(options: UiServerOptions): Promise<UiServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const root = options.root === null ? null : resolve(options.root);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

    if (url.pathname === "/config.json") {
      const text = JSON.stringify(options.config);
      res.writeHead(200, { "content-type": CONTENT_TYPES[".json"]! });
      res.end(text);
      return;
    }

    if (root === null) {
      res.writeHead(200, { "content-type": CONTENT_TYPES[".html"]! });
      res.end(PLACEHOLDER_HTML);
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const target = resolve(join(root, pathname === "/" ? "index.html" : `.${pathname}`));
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }

    try {
      const data = await readFile(target);
      const type = CONTENT_TYPES[extname(target)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    } catch {
      try {
        const index = await readFile(join(root, "index.html"));
        res.writeHead(200, { "content-type": CONTENT_TYPES[".html"]! });
        res.end(index);
      } catch {
        res.writeHead(404);
        res.end();
      }
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const boundPort =
        typeof address === "object" && address !== null ? address.port : port;
      resolvePromise({
        server,
        host,
        port: boundPort,
        close: () => new Promise<void>((r) => server.close(() => r()))
      });
    });
  });
}
