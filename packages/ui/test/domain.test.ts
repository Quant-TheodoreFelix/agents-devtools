import { describe, expect, it } from "vitest";
import {
  buildConnections,
  buildIncidents,
  buildScheduleBoard,
  buildTurns
} from "../src/domain";
import type { Row } from "../src/store";

let seqCounter = 0;

function row(
  channel: string,
  type: string,
  payload: Record<string, unknown>,
  timestamp = 1000 + seqCounter
): Row {
  seqCounter += 1;
  return {
    env: {
      v: 1,
      seq: seqCounter,
      receivedAt: timestamp,
      channel,
      event: { type, agent: "A", name: "n", payload, timestamp }
    },
    text: type.toLowerCase()
  };
}

function chat(type: string, payload: Record<string, unknown>): Row {
  return row("agents:chat", type, payload);
}

describe("buildIncidents", () => {
  it("chains recovery events by incidentId with stalled prologue", () => {
    seqCounter = 0;
    const rows = [
      chat("chat:stream:stalled", { requestId: "r1", timeoutMs: 2000 }),
      chat("chat:recovery:detected", {
        incidentId: "i1",
        requestId: "r1",
        attempt: 1,
        maxAttempts: 3,
        recoveryKind: "continue"
      }),
      chat("chat:recovery:attempt", {
        incidentId: "i1",
        requestId: "r1",
        attempt: 1,
        maxAttempts: 3,
        recoveryKind: "continue"
      }),
      chat("chat:recovery:completed", {
        incidentId: "i1",
        requestId: "r1",
        attempt: 1,
        maxAttempts: 3,
        recoveryKind: "continue"
      })
    ];
    const incidents = buildIncidents(rows);
    expect(incidents).toHaveLength(1);
    const incident = incidents[0]!;
    expect(incident.incidentId).toBe("i1");
    expect(incident.status).toBe("completed");
    expect(incident.recoveryKind).toBe("continue");
    expect(incident.attempt).toBe(1);
    expect(incident.maxAttempts).toBe(3);
    expect(incident.items.map((i) => i.row.env.event.type)).toEqual([
      "chat:stream:stalled",
      "chat:recovery:detected",
      "chat:recovery:attempt",
      "chat:recovery:completed"
    ]);
  });

  it("captures exhausted reason and keeps max attempt", () => {
    seqCounter = 0;
    const base = {
      incidentId: "i2",
      requestId: "r2",
      maxAttempts: 3,
      recoveryKind: "continue"
    };
    const incidents = buildIncidents([
      chat("chat:recovery:detected", { ...base, attempt: 1 }),
      chat("chat:recovery:attempt", { ...base, attempt: 2 }),
      chat("chat:recovery:exhausted", {
        ...base,
        attempt: 3,
        reason: "no_progress_timeout"
      })
    ]);
    expect(incidents[0]!.status).toBe("exhausted");
    expect(incidents[0]!.reason).toBe("no_progress_timeout");
    expect(incidents[0]!.attempt).toBe(3);
  });

  it("keeps separate incidents and sorts recent first", () => {
    seqCounter = 0;
    const incidents = buildIncidents([
      chat("chat:recovery:detected", {
        incidentId: "old",
        requestId: "r1",
        attempt: 1,
        maxAttempts: 3,
        recoveryKind: "retry"
      }),
      chat("chat:recovery:detected", {
        incidentId: "new",
        requestId: "r2",
        attempt: 1,
        maxAttempts: 3,
        recoveryKind: "continue"
      })
    ]);
    expect(incidents.map((i) => i.incidentId)).toEqual(["new", "old"]);
    expect(incidents[1]!.status).toBe("active");
  });

  it("ignores stalled events without a matching incident", () => {
    seqCounter = 0;
    const incidents = buildIncidents([
      chat("chat:stream:stalled", { requestId: "orphan", timeoutMs: 100 })
    ]);
    expect(incidents).toHaveLength(0);
  });
});

describe("buildTurns", () => {
  it("groups chat events by requestId with finish status", () => {
    seqCounter = 0;
    const turns = buildTurns([
      chat("chat:turn:start", {
        requestId: "r1",
        trigger: "user_message",
        admission: "run"
      }),
      row("agents:message", "message:request", { requestId: "r1" }),
      chat("chat:turn:finish", {
        requestId: "r1",
        trigger: "user_message",
        admission: "run",
        status: "completed",
        durationMs: 420
      })
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.status).toBe("completed");
    expect(turns[0]!.trigger).toBe("user_message");
    expect(turns[0]!.durationMs).toBe(420);
    expect(turns[0]!.items).toHaveLength(3);
  });

  it("marks transcript repair badge and excludes recovery events", () => {
    seqCounter = 0;
    const turns = buildTurns([
      chat("chat:turn:start", {
        requestId: "r1",
        trigger: "user_message",
        admission: "run"
      }),
      row("agents:transcript", "chat:transcript:repaired", {
        requestId: "r1",
        removedToolCalls: 2,
        normalizedInputs: 1
      }),
      chat("chat:recovery:detected", {
        incidentId: "i1",
        requestId: "r1",
        attempt: 1,
        maxAttempts: 3,
        recoveryKind: "continue"
      })
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.repairedBadge).toEqual({
      removedToolCalls: 2,
      normalizedInputs: 1
    });
    expect(turns[0]!.items).toHaveLength(2);
  });

  it("buckets events without requestId together", () => {
    seqCounter = 0;
    const turns = buildTurns([
      row("agents:message", "message:clear", {}),
      row("agents:rpc", "rpc", {})
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.requestId).toBeNull();
    expect(turns[0]!.items).toHaveLength(1);
  });
});

describe("buildScheduleBoard", () => {
  function sched(type: string, payload: Record<string, unknown>): Row {
    return row("agents:schedule", type, payload);
  }

  it("tracks card state transitions by id", () => {
    seqCounter = 0;
    const board = buildScheduleBoard([
      sched("schedule:create", { callback: "tick", id: "s1" }),
      sched("schedule:create", { callback: "tock", id: "s2" }),
      sched("schedule:execute", { callback: "tick", id: "s1" })
    ]);
    expect(board.cards).toHaveLength(2);
    const s1 = board.cards.find((c) => c.id === "s1")!;
    expect(s1.state).toBe("executed");
    expect(s1.callback).toBe("tick");
    expect(s1.eventCount).toBe(2);
    const s2 = board.cards.find((c) => c.id === "s2")!;
    expect(s2.state).toBe("pending");
  });

  it("captures retry progress and error", () => {
    seqCounter = 0;
    const board = buildScheduleBoard([
      sched("schedule:create", { callback: "job", id: "s1" }),
      sched("schedule:retry", {
        callback: "job",
        id: "s1",
        attempt: 2,
        maxAttempts: 5
      }),
      sched("schedule:error", {
        callback: "job",
        id: "s1",
        error: "boom",
        attempts: 5
      })
    ]);
    const card = board.cards[0]!;
    expect(card.state).toBe("failed");
    expect(card.attempt).toBe(5);
    expect(card.maxAttempts).toBe(5);
    expect(card.error).toBe("boom");
  });

  it("collects duplicate warnings separately", () => {
    seqCounter = 0;
    const board = buildScheduleBoard([
      sched("schedule:duplicate_warning", {
        callback: "tick",
        count: 12,
        type: "one-shot"
      })
    ]);
    expect(board.cards).toHaveLength(0);
    expect(board.warnings).toHaveLength(1);
    expect(board.warnings[0]!.callback).toBe("tick");
    expect(board.warnings[0]!.count).toBe(12);
  });

  it("keeps queue and schedule cards apart on id collision", () => {
    seqCounter = 0;
    const board = buildScheduleBoard([
      sched("schedule:create", { callback: "a", id: "x" }),
      sched("queue:create", { callback: "b", id: "x" })
    ]);
    expect(board.cards).toHaveLength(2);
    expect(board.cards.map((c) => c.kind).sort()).toEqual([
      "queue",
      "schedule"
    ]);
  });
});

describe("buildConnections", () => {
  function life(type: string, payload: Record<string, unknown>, ts?: number): Row {
    return row("agents:lifecycle", type, payload, ts);
  }

  it("pairs connect and disconnect with duration", () => {
    seqCounter = 0;
    const view = buildConnections([
      life("connect", { connectionId: "c1" }, 1000),
      life("disconnect", { connectionId: "c1", code: 1000, reason: "bye" }, 1600)
    ]);
    expect(view.connections).toHaveLength(1);
    const conn = view.connections[0]!;
    expect(conn.open).toBe(false);
    expect(conn.durationMs).toBe(600);
    expect(conn.code).toBe(1000);
    expect(conn.reason).toBe("bye");
    expect(view.maxDurationMs).toBe(600);
  });

  it("keeps open connections and reconnects with the same id", () => {
    seqCounter = 0;
    const view = buildConnections([
      life("connect", { connectionId: "c1" }, 1000),
      life("disconnect", { connectionId: "c1", code: 1006, reason: "" }, 1200),
      life("connect", { connectionId: "c1" }, 1400)
    ]);
    expect(view.connections).toHaveLength(2);
    expect(view.connections[0]!.open).toBe(true);
    expect(view.connections[1]!.open).toBe(false);
  });

  it("lists orphan disconnects and counts destroy", () => {
    seqCounter = 0;
    const view = buildConnections([
      life("disconnect", { connectionId: "ghost", code: 1001, reason: "gone" }),
      life("destroy", {})
    ]);
    expect(view.connections).toHaveLength(1);
    expect(view.connections[0]!.connectSeq).toBeNull();
    expect(view.destroyCount).toBe(1);
  });
});
