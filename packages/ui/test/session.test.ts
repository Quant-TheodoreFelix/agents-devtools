import { describe, expect, it } from "vitest";
import { buildSessionText, parseSessionText } from "../src/session";
import type { Row } from "../src/store";

function row(seq: number): Row {
  return {
    env: {
      v: 1,
      seq,
      receivedAt: 1000 + seq,
      channel: "agents:rpc",
      event: {
        type: "rpc",
        agent: "A",
        name: "n",
        payload: { i: seq },
        timestamp: 1000 + seq
      }
    },
    text: "rpc"
  };
}

describe("buildSessionText", () => {
  it("writes a session header followed by one line per row", () => {
    const text = buildSessionText([row(1), row(2)], 5000);
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(3);
    const header = JSON.parse(lines[0]!);
    expect(header.kind).toBe("session");
    expect(header.createdAt).toBe(5000);
    const first = JSON.parse(lines[1]!);
    expect(first.seq).toBe(1);
  });

  it("writes just the header when there are no rows", () => {
    const text = buildSessionText([], 1);
    expect(text.trim().split("\n")).toHaveLength(1);
  });
});

describe("parseSessionText", () => {
  it("round-trips what buildSessionText produced", () => {
    const text = buildSessionText([row(3), row(1), row(2)], 42);
    const { header, envelopes, errors } = parseSessionText(text);
    expect(header?.createdAt).toBe(42);
    expect(errors).toBe(0);
    expect(envelopes.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("counts malformed lines as errors without throwing", () => {
    const { header, envelopes, errors } = parseSessionText(
      'not json\n{"v":2,"seq":1}\n'
    );
    expect(header).toBeNull();
    expect(envelopes).toHaveLength(0);
    expect(errors).toBe(2);
  });

  it("handles a file with no header record", () => {
    const line = JSON.stringify(row(1).env);
    const { header, envelopes } = parseSessionText(line);
    expect(header).toBeNull();
    expect(envelopes).toHaveLength(1);
  });
});
