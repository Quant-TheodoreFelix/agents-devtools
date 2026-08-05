import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObservabilityEvent } from "agents/observability";
import { devtools } from "../src";

const rpcEvent = (n: number): ObservabilityEvent =>
  ({
    type: "rpc",
    agent: "MyAgent",
    name: "user-123",
    payload: { method: `m${n}` },
    timestamp: Date.now()
  }) as ObservabilityEvent;

describe("devtools()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("chains the base observability on every emit", () => {
    const base = { emit: vi.fn() };
    const obs = devtools({ base });
    const event = rpcEvent(1);
    obs.emit(event);
    expect(base.emit).toHaveBeenCalledWith(event);
  });

  it("flushes after the interval with the derived channel", async () => {
    const obs = devtools({ base: null });
    obs.emit(rpcEvent(1));
    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:4111/ingest");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.v).toBe(1);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].channel).toBe("agents:rpc");
  });

  it("flushes immediately when maxBatch is reached", () => {
    const obs = devtools({ base: null, maxBatch: 5 });
    for (let i = 0; i < 5; i++) obs.emit(rpcEvent(i));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string).events).toHaveLength(5);
  });

  it("never throws when the collector is unreachable", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new Error("connection refused"))
    );
    const obs = devtools({ base: null });
    expect(() => obs.emit(rpcEvent(1))).not.toThrow();
    await vi.advanceTimersByTimeAsync(250);
  });

  it("disables itself after maxFailures consecutive failures", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new Error("connection refused"))
    );
    const obs = devtools({ base: null, maxFailures: 2, flushIntervalMs: 1 });

    obs.emit(rpcEvent(1));
    await vi.advanceTimersByTimeAsync(5);
    await vi.advanceTimersByTimeAsync(3000);
    obs.emit(rpcEvent(2));
    await vi.advanceTimersByTimeAsync(5);
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    obs.emit(rpcEvent(3));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does nothing when enabled is false", async () => {
    const base = { emit: vi.fn() };
    const obs = devtools({ base, enabled: false });
    obs.emit(rpcEvent(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).not.toHaveBeenCalled();
    expect(base.emit).toHaveBeenCalledTimes(1);
  });

  const stateEvent = (payload = {}): ObservabilityEvent =>
    ({
      type: "state:update",
      agent: "MyAgent",
      name: "user-123",
      payload,
      timestamp: Date.now()
    }) as ObservabilityEvent;

  it("attaches a shallow snapshot to state:update when captureState is set", async () => {
    const obs = devtools({
      base: null,
      captureState: () => ({ counter: 1, big: "x".repeat(500) })
    });
    obs.emit(stateEvent());
    await vi.advanceTimersByTimeAsync(250);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const sent = JSON.parse((init as RequestInit).body as string).events[0].event;
    expect(sent.payload.snapshot.counter).toBe(1);
    expect(sent.payload.snapshot.big).toMatch(/…\(truncated\)$/);
  });

  it("never mutates the event passed to base for state:update", () => {
    const base = { emit: vi.fn() };
    const obs = devtools({ base, captureState: () => ({ counter: 1 }) });
    const event = stateEvent();
    obs.emit(event);
    expect(base.emit).toHaveBeenCalledWith(event);
    expect(event.payload).toEqual({});
  });

  it("leaves non state:update events untouched by captureState", async () => {
    const obs = devtools({ base: null, captureState: () => ({ counter: 1 }) });
    obs.emit(rpcEvent(1));
    await vi.advanceTimersByTimeAsync(250);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const sent = JSON.parse((init as RequestInit).body as string).events[0].event;
    expect(sent.payload.snapshot).toBeUndefined();
  });

  it("swallows a throwing captureState without dropping the event", async () => {
    const obs = devtools({
      base: null,
      captureState: () => {
        throw new Error("nope");
      }
    });
    expect(() => obs.emit(stateEvent())).not.toThrow();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not attach a snapshot when captureState is not set", async () => {
    const obs = devtools({ base: null });
    obs.emit(stateEvent());
    await vi.advanceTimersByTimeAsync(250);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const sent = JSON.parse((init as RequestInit).body as string).events[0].event;
    expect(sent.payload.snapshot).toBeUndefined();
  });
});
