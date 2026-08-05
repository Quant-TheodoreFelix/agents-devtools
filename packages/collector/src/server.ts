import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import {
  DEFAULT_INGEST_PATH,
  type IngestBatch,
  type ObservabilityEventLike,
  type ServerMessage
} from "@agents-devtools/protocol";
import { EventBuffer } from "./buffer";
import { Recorder } from "./recorder";

export type CollectorOptions = {
  host?: string;
  port?: number;
  bufferSize?: number;
  recordPath?: string;
  maxBodyBytes?: number;
  maxBatchEvents?: number;
  tool?: string;
};

export type Collector = {
  server: Server;
  buffer: EventBuffer;
  host: string;
  port: number;
  clientCount(): number;
  close(): Promise<void>;
};

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLocalOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin !== undefined && isLocalOrigin(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

function readBody(
  req: IncomingMessage,
  maxBytes: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflowed = false;
    req.on("data", (chunk: Buffer) => {
      if (overflowed) return;
      size += chunk.length;
      if (size > maxBytes) {
        overflowed = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () =>
      resolve(overflowed ? null : Buffer.concat(chunks).toString("utf8"))
    );
    req.on("error", () => resolve(null));
  });
}

function normalizeEvent(value: unknown): ObservabilityEventLike | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.type !== "string" || typeof e.timestamp !== "number") {
    return null;
  }
  const payload =
    typeof e.payload === "object" && e.payload !== null
      ? (e.payload as Record<string, unknown>)
      : {};
  return {
    type: e.type,
    ...(typeof e.agent === "string" ? { agent: e.agent } : {}),
    ...(typeof e.name === "string" ? { name: e.name } : {}),
    payload,
    timestamp: e.timestamp
  };
}

export function parseBatch(
  raw: string,
  maxEvents: number
): IngestBatch["events"] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const batch = data as Record<string, unknown>;
  if (batch.v !== 1 || !Array.isArray(batch.events)) return null;
  if (batch.events.length > maxEvents) return null;
  const events: IngestBatch["events"] = [];
  for (const item of batch.events) {
    if (typeof item !== "object" || item === null) return null;
    const entry = item as Record<string, unknown>;
    if (typeof entry.channel !== "string") return null;
    const event = normalizeEvent(entry.event);
    if (event === null) return null;
    events.push({ channel: entry.channel, event });
  }
  return events;
}

export function createCollector(
  options: CollectorOptions = {}
): Promise<Collector> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const bufferSize = options.bufferSize ?? 50_000;
  const maxBodyBytes = options.maxBodyBytes ?? 5 * 1024 * 1024;
  const maxBatchEvents = options.maxBatchEvents ?? 5000;
  const tool = options.tool ?? "agents-devtools@dev";

  const buffer = new EventBuffer(bufferSize);
  const recorder =
    options.recordPath !== undefined
      ? new Recorder(options.recordPath, tool)
      : null;
  const clients = new Set<WebSocket>();

  const broadcast = (message: ServerMessage): void => {
    if (clients.size === 0) return;
    const text = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === client.OPEN) client.send(text);
    }
  };

  const server = createServer(async (req, res) => {
    applyCors(req, res);
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === DEFAULT_INGEST_PATH) {
      const body = await readBody(req, maxBodyBytes);
      if (body === null) {
        sendJson(res, 413, { error: "body too large" });
        return;
      }
      const events = parseBatch(body, maxBatchEvents);
      if (events === null) {
        sendJson(res, 400, { error: "invalid batch" });
        return;
      }
      const envelopes = buffer.ingest(events, Date.now());
      recorder?.append(envelopes);
      broadcast({ kind: "events", envelopes, dropped: buffer.dropped });
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      const sinceRaw = url.searchParams.get("since");
      const since = sinceRaw === null ? 0 : Number.parseInt(sinceRaw, 10);
      const envelopes = buffer.since(Number.isFinite(since) ? since : 0);
      sendJson(res, 200, {
        envelopes,
        dropped: buffer.dropped,
        total: buffer.total
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        total: buffer.total,
        dropped: buffer.dropped,
        buffered: buffer.size
      });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on(
    "upgrade",
    (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const pathname = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? host}`
      ).pathname;
      if (pathname !== "/ws" || !isLocalOrigin(req.headers.origin)) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        clients.add(ws);
        ws.on("close", () => clients.delete(ws));
        const hello: ServerMessage = {
          kind: "hello",
          seq: buffer.total,
          dropped: buffer.dropped,
          total: buffer.total
        };
        ws.send(JSON.stringify(hello));
      });
    }
  );

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const boundPort =
        typeof address === "object" && address !== null ? address.port : port;
      resolve({
        server,
        buffer,
        host,
        port: boundPort,
        clientCount: () => clients.size,
        close: async () => {
          for (const client of clients) client.terminate();
          clients.clear();
          await new Promise<void>((r) => wss.close(() => r()));
          await new Promise<void>((r) => server.close(() => r()));
          await recorder?.close();
        }
      });
    });
  });
}
