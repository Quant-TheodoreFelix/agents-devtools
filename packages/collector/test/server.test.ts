import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { parseRecords, isSessionHeader } from "@agents-devtools/protocol";
import { createCollector, type Collector } from "../src/server";

let collector: Collector | null = null;

afterEach(async () => {
  await collector?.close();
  collector = null;
});

const batch = (n: number) => ({
  v: 1,
  events: Array.from({ length: n }, (_, i) => ({
    channel: "agents:rpc",
    event: {
      type: "rpc",
      agent: "MyAgent",
      name: "user-123",
      payload: { method: `m${i}` },
      timestamp: Date.now()
    }
  }))
});

const post = (port: number, body: unknown) =>
  fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

describe("collector server", () => {
  it("ingests a batch and serves it back on /events", async () => {
    collector = await createCollector();
    const res = await post(collector.port, batch(3));
    expect(res.status).toBe(204);

    const events = (await fetch(
      `http://127.0.0.1:${collector.port}/events?since=1`
    ).then((r) => r.json())) as {
      envelopes: Array<{ seq: number; channel: string }>;
      total: number;
      dropped: number;
    };
    expect(events.envelopes).toHaveLength(2);
    expect(events.envelopes[0]!.seq).toBe(2);
    expect(events.envelopes[0]!.channel).toBe("agents:rpc");
    expect(events.total).toBe(3);
    expect(events.dropped).toBe(0);
  });

  it("rejects malformed batches with 400", async () => {
    collector = await createCollector();
    for (const bad of [
      "not json",
      JSON.stringify({ v: 2, events: [] }),
      JSON.stringify({ v: 1, events: [{ channel: 5, event: {} }] }),
      JSON.stringify({ v: 1, events: [{ channel: "c", event: { type: "x" } }] })
    ]) {
      const res = await post(collector.port, bad);
      expect(res.status).toBe(400);
    }
    expect(collector.buffer.total).toBe(0);
  });

  it("rejects oversized bodies with 413", async () => {
    collector = await createCollector({ maxBodyBytes: 100 });
    const res = await post(collector.port, batch(50));
    expect(res.status).toBe(413);
  });

  it("reports /health", async () => {
    collector = await createCollector();
    await post(collector.port, batch(2));
    const health = await fetch(
      `http://127.0.0.1:${collector.port}/health`
    ).then((r) => r.json());
    expect(health).toMatchObject({ ok: true, total: 2, dropped: 0, buffered: 2 });
  });

  it("broadcasts ingested events to websocket clients", async () => {
    collector = await createCollector();
    const ws = new WebSocket(`ws://127.0.0.1:${collector.port}/ws`);
    const messages: Array<Record<string, unknown>> = [];
    const gotEvents = new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        const parsed = JSON.parse(String(data));
        messages.push(parsed);
        if (parsed.kind === "events") resolve();
      });
    });
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));
    await post(collector.port, batch(2));
    await gotEvents;
    ws.close();

    expect(messages[0]).toMatchObject({ kind: "hello", total: 0 });
    const eventsMsg = messages.find((m) => m.kind === "events")!;
    expect((eventsMsg.envelopes as unknown[]).length).toBe(2);
  });

  it("records envelopes as NDJSON with a session header", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agents-devtools-test-"));
    const file = join(dir, "session.ndjson");
    collector = await createCollector({
      recordPath: file,
      tool: "agents-devtools@test"
    });
    await post(collector.port, batch(2));
    await collector.close();
    collector = null;

    const { records, errors } = parseRecords(readFileSync(file, "utf8"));
    expect(errors).toBe(0);
    expect(records).toHaveLength(3);
    expect(isSessionHeader(records[0]!)).toBe(true);
    expect(records[1]).toMatchObject({ seq: 1, channel: "agents:rpc" });
  });

  it("destroys websocket upgrades from non-local origins", async () => {
    collector = await createCollector();
    const ws = new WebSocket(`ws://127.0.0.1:${collector.port}/ws`, {
      headers: { origin: "https://evil.example.com" }
    });
    const closed = await new Promise<boolean>((resolve) => {
      ws.on("error", () => resolve(true));
      ws.on("open", () => resolve(false));
    });
    expect(closed).toBe(true);
  });
});
