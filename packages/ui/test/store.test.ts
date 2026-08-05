import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../src/store";
import type { EventEnvelope } from "@agents-devtools/protocol";

function envelope(seq: number): EventEnvelope {
  return {
    v: 1,
    seq,
    receivedAt: seq,
    channel: "agents:rpc",
    event: { type: "rpc", agent: "A", name: "n", payload: {}, timestamp: seq }
  };
}

beforeEach(() => {
  useStore.setState(
    {
      rows: [],
      lastSeq: 0,
      dropped: 0,
      status: "connecting",
      selectedSeq: null,
      paused: false,
      session: { kind: "live" }
    },
    false
  );
});

describe("addEnvelopes / paused", () => {
  it("ignores incoming envelopes while paused, freezing lastSeq", () => {
    useStore.getState().setPaused(true);
    useStore.getState().addEnvelopes([envelope(1), envelope(2)]);
    expect(useStore.getState().rows).toHaveLength(0);
    expect(useStore.getState().lastSeq).toBe(0);
  });

  it("resumes applying envelopes once unpaused", () => {
    useStore.getState().setPaused(true);
    useStore.getState().addEnvelopes([envelope(1)]);
    useStore.getState().setPaused(false);
    useStore.getState().addEnvelopes([envelope(1), envelope(2)]);
    expect(useStore.getState().rows.map((r) => r.env.seq)).toEqual([1, 2]);
  });
});

describe("loadReplay / exitReplay", () => {
  it("switches into replay mode, forces pause, and remembers the live seq", () => {
    useStore.getState().addEnvelopes([envelope(1), envelope(2)]);
    useStore.getState().loadReplay("bug.ndjson", null, [envelope(9)], 0);

    const state = useStore.getState();
    expect(state.paused).toBe(true);
    expect(state.rows.map((r) => r.env.seq)).toEqual([9]);
    expect(state.lastSeq).toBe(9);
    expect(state.session.kind).toBe("replay");
    expect(state.session).toMatchObject({
      fileName: "bug.ndjson",
      header: null,
      savedLastSeq: 2,
      parseErrors: 0
    });
    expect(
      state.session.kind === "replay"
        ? state.session.savedRows.map((r) => r.env.seq)
        : null
    ).toEqual([1, 2]);
  });

  it("restores the pre-replay rows, seq, and live mode on exit", () => {
    useStore.getState().addEnvelopes([envelope(1), envelope(2)]);
    useStore.getState().loadReplay("bug.ndjson", null, [envelope(9)], 0);
    useStore.getState().exitReplay();

    const state = useStore.getState();
    expect(state.session).toEqual({ kind: "live" });
    expect(state.paused).toBe(false);
    expect(state.rows.map((r) => r.env.seq)).toEqual([1, 2]);
    expect(state.lastSeq).toBe(2);
  });

  it("is a no-op when called while already live", () => {
    useStore.getState().addEnvelopes([envelope(1)]);
    useStore.getState().exitReplay();
    expect(useStore.getState().rows).toHaveLength(1);
    expect(useStore.getState().session).toEqual({ kind: "live" });
  });

  it("keeps the original saved rows and seq across repeated imports", () => {
    useStore.getState().addEnvelopes([envelope(1), envelope(2)]);
    useStore.getState().loadReplay("a.ndjson", null, [envelope(9)], 0);
    useStore.getState().loadReplay("b.ndjson", null, [envelope(10)], 1);

    const state = useStore.getState();
    expect(state.session).toMatchObject({
      fileName: "b.ndjson",
      savedLastSeq: 2,
      parseErrors: 1
    });
    expect(
      state.session.kind === "replay"
        ? state.session.savedRows.map((r) => r.env.seq)
        : null
    ).toEqual([1, 2]);
  });
});
