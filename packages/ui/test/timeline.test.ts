import { describe, expect, it } from "vitest";
import type { Row } from "../src/store";
import {
  buildTimeline,
  severityForType,
  summarizeInstances
} from "../src/timeline";

let seq = 0;

function row(
  type: string,
  payload: Record<string, unknown> = {},
  meta: { agent?: string; name?: string } = { agent: "A", name: "x" }
): Row {
  seq += 1;
  return {
    env: {
      v: 1,
      seq,
      receivedAt: seq * 10,
      channel: "agents:fiber",
      event: { type, ...meta, payload, timestamp: seq * 10 }
    },
    text: type
  };
}

describe("severityForType", () => {
  it.each([
    ["rpc:error", "error"],
    ["chat:request:failed", "error"],
    ["chat:recovery:exhausted", "error"],
    ["fiber:run:interrupted", "error"],
    ["chat:stream:stalled", "warn"],
    ["schedule:duplicate_warning", "warn"],
    ["rpc", null],
    ["connect", null]
  ] as const)("%s -> %s", (type, expected) => {
    expect(severityForType(type)).toBe(expected);
  });
});

describe("buildTimeline", () => {
  it("pairs fiber start and completion into a span with elapsedMs", () => {
    const rows = [
      row("fiber:run:started", { fiberId: "f1", fiberName: "chat" }),
      row("rpc", { method: "m" }),
      row("fiber:run:completed", { fiberId: "f1", fiberName: "chat", elapsedMs: 42 })
    ];
    const { spans, items, laneCount } = buildTimeline(rows);
    expect(laneCount).toBe(1);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      fiberId: "f1",
      startIndex: 0,
      endIndex: 2,
      outcome: "completed",
      elapsedMs: 42
    });
    expect(items[0]!.lanes).toEqual([{ mark: "start", outcome: "completed" }]);
    expect(items[1]!.lanes).toEqual([{ mark: "active", outcome: "completed" }]);
    expect(items[2]!.lanes).toEqual([{ mark: "end", outcome: "completed" }]);
  });

  it("assigns separate lanes to overlapping fibers and reuses freed lanes", () => {
    const rows = [
      row("fiber:run:started", { fiberId: "f1" }),
      row("fiber:run:started", { fiberId: "f2" }),
      row("fiber:run:completed", { fiberId: "f1" }),
      row("fiber:run:started", { fiberId: "f3" }),
      row("fiber:run:failed", { fiberId: "f2" }),
      row("fiber:run:completed", { fiberId: "f3" })
    ];
    const { spans, laneCount } = buildTimeline(rows);
    expect(laneCount).toBe(2);
    expect(spans.map((s) => s.lane)).toEqual([0, 1, 0]);
    expect(spans.map((s) => s.outcome)).toEqual([
      "completed",
      "failed",
      "completed"
    ]);
  });

  it("marks interrupted fibers as failed and leaves unmatched fibers open", () => {
    const rows = [
      row("fiber:run:started", { fiberId: "f1" }),
      row("fiber:run:interrupted", { fiberId: "f1" }),
      row("fiber:run:started", { fiberId: "f2" }),
      row("rpc", { method: "m" })
    ];
    const { spans, items } = buildTimeline(rows);
    expect(spans[0]!.outcome).toBe("failed");
    expect(spans[1]!.outcome).toBe("open");
    expect(spans[1]!.endIndex).toBeNull();
    expect(items[3]!.lanes[spans[1]!.lane]).toEqual({
      mark: "active",
      outcome: "open"
    });
  });

  it("ignores fiber end events without a matching start", () => {
    const rows = [row("fiber:run:completed", { fiberId: "ghost" })];
    const { spans } = buildTimeline(rows);
    expect(spans).toHaveLength(0);
  });

  it("treats fiber:recovery events as points, not span ends", () => {
    const rows = [
      row("fiber:run:started", { fiberId: "f1" }),
      row("fiber:recovery:detected", { fiberId: "f1" }),
      row("fiber:run:completed", { fiberId: "f1" })
    ];
    const { spans } = buildTimeline(rows);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.endIndex).toBe(2);
  });
});

describe("summarizeInstances", () => {
  it("groups by key, counts errors, sorts by recent activity", () => {
    const rows = [
      row("rpc", {}, { agent: "A", name: "one" }),
      row("rpc:error", {}, { agent: "A", name: "one" }),
      row("connect", {}, { agent: "B", name: "two" })
    ];
    const summaries = summarizeInstances(rows, (r) =>
      `${r.env.event.agent}/${r.env.event.name}`
    );
    expect(summaries.map((s) => s.key)).toEqual(["B/two", "A/one"]);
    expect(summaries[1]).toMatchObject({ count: 2, errorCount: 1 });
  });
});
