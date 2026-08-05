import { describe, expect, it } from "vitest";
import { EventBuffer } from "../src/buffer";

const item = (n: number) => ({
  channel: "agents:rpc",
  event: {
    type: "rpc",
    agent: "A",
    name: "i",
    payload: { n },
    timestamp: n
  }
});

describe("EventBuffer", () => {
  it("assigns monotonically increasing seq", () => {
    const buffer = new EventBuffer(10);
    const first = buffer.ingest([item(1), item(2)], 100);
    const second = buffer.ingest([item(3)], 200);
    expect(first.map((e) => e.seq)).toEqual([1, 2]);
    expect(second[0]!.seq).toBe(3);
    expect(second[0]!.receivedAt).toBe(200);
  });

  it("drops oldest events past capacity and counts them", () => {
    const buffer = new EventBuffer(3);
    buffer.ingest([item(1), item(2), item(3), item(4), item(5)], 100);
    expect(buffer.size).toBe(3);
    expect(buffer.dropped).toBe(2);
    expect(buffer.total).toBe(5);
    expect(buffer.ordered().map((e) => e.seq)).toEqual([3, 4, 5]);
  });

  it("filters by seq in since()", () => {
    const buffer = new EventBuffer(10);
    buffer.ingest([item(1), item(2), item(3)], 100);
    expect(buffer.since(1).map((e) => e.seq)).toEqual([2, 3]);
    expect(buffer.since(0)).toHaveLength(3);
    expect(buffer.since(99)).toHaveLength(0);
  });

  it("rejects invalid capacity", () => {
    expect(() => new EventBuffer(0)).toThrow();
  });
});
