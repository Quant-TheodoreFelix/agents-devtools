import type { Row } from "./store";

export type Severity = "error" | "warn" | null;

export function severityForType(type: string): Severity {
  if (
    type.includes("error") ||
    type.includes("failed") ||
    type.includes("exhausted") ||
    type === "fiber:run:interrupted"
  ) {
    return "error";
  }
  if (type.includes("stalled") || type.includes("duplicate_warning")) {
    return "warn";
  }
  return null;
}

export type FiberOutcome = "completed" | "failed" | "open";

export type FiberSpan = {
  fiberId: string;
  fiberName: string;
  lane: number;
  startIndex: number;
  endIndex: number | null;
  outcome: FiberOutcome;
  elapsedMs: number | null;
};

export type LaneCell = {
  mark: "start" | "active" | "end";
  outcome: FiberOutcome;
} | null;

export type TimelineItem = {
  row: Row;
  severity: Severity;
  lanes: LaneCell[];
  span: FiberSpan | null;
};

export type Timeline = {
  items: TimelineItem[];
  laneCount: number;
  spans: FiberSpan[];
};

const FIBER_END_OUTCOME: Record<string, "completed" | "failed"> = {
  "fiber:run:completed": "completed",
  "fiber:run:failed": "failed",
  "fiber:run:interrupted": "failed"
};

export function buildTimeline(rows: Row[]): Timeline {
  const spans: FiberSpan[] = [];
  const openByFiberId = new Map<string, FiberSpan>();
  const usedLanes = new Set<number>();
  const spanAt = new Map<number, FiberSpan>();

  const takeLane = (): number => {
    let lane = 0;
    while (usedLanes.has(lane)) lane += 1;
    usedLanes.add(lane);
    return lane;
  };

  rows.forEach((row, index) => {
    const { type, payload } = row.env.event;
    const fiberId =
      typeof payload.fiberId === "string" ? payload.fiberId : null;
    if (fiberId === null) return;

    if (type === "fiber:run:started") {
      openByFiberId.delete(fiberId);
      const span: FiberSpan = {
        fiberId,
        fiberName:
          typeof payload.fiberName === "string" ? payload.fiberName : fiberId,
        lane: takeLane(),
        startIndex: index,
        endIndex: null,
        outcome: "open",
        elapsedMs: null
      };
      spans.push(span);
      openByFiberId.set(fiberId, span);
      spanAt.set(index, span);
      return;
    }

    const outcome = FIBER_END_OUTCOME[type];
    if (outcome !== undefined) {
      const span = openByFiberId.get(fiberId);
      if (span === undefined) return;
      span.endIndex = index;
      span.outcome = outcome;
      span.elapsedMs =
        typeof payload.elapsedMs === "number" ? payload.elapsedMs : null;
      openByFiberId.delete(fiberId);
      usedLanes.delete(span.lane);
      spanAt.set(index, span);
    }
  });

  const laneCount = spans.reduce((max, s) => Math.max(max, s.lane + 1), 0);

  const activeLanes = new Map<number, FiberSpan>();
  const items: TimelineItem[] = rows.map((row, index) => {
    const lanes: LaneCell[] = Array.from({ length: laneCount }, () => null);
    for (const [lane, active] of activeLanes) {
      lanes[lane] = { mark: "active", outcome: active.outcome };
    }
    const span = spanAt.get(index) ?? null;
    if (span !== null) {
      if (index === span.startIndex) {
        lanes[span.lane] = { mark: "start", outcome: span.outcome };
        if (span.endIndex !== index) activeLanes.set(span.lane, span);
      }
      if (index === span.endIndex) {
        lanes[span.lane] = { mark: "end", outcome: span.outcome };
        activeLanes.delete(span.lane);
      }
    }
    return {
      row,
      severity: severityForType(row.env.event.type),
      lanes,
      span
    };
  });

  return { items, laneCount, spans };
}

export type InstanceSummary = {
  key: string;
  count: number;
  errorCount: number;
  lastSeq: number;
  lastTimestamp: number;
};

export function summarizeInstances(
  rows: Row[],
  keyOf: (row: Row) => string
): InstanceSummary[] {
  const byKey = new Map<string, InstanceSummary>();
  for (const row of rows) {
    const key = keyOf(row);
    let summary = byKey.get(key);
    if (summary === undefined) {
      summary = {
        key,
        count: 0,
        errorCount: 0,
        lastSeq: 0,
        lastTimestamp: 0
      };
      byKey.set(key, summary);
    }
    summary.count += 1;
    if (severityForType(row.env.event.type) === "error") {
      summary.errorCount += 1;
    }
    summary.lastSeq = row.env.seq;
    summary.lastTimestamp = row.env.event.timestamp;
  }
  return [...byKey.values()].sort((a, b) => b.lastSeq - a.lastSeq);
}
