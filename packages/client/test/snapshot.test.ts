import { describe, expect, it } from "vitest";
import { shallowSnapshot } from "../src/snapshot";

describe("shallowSnapshot", () => {
  it("passes through primitive state", () => {
    expect(shallowSnapshot(42)).toBe(42);
    expect(shallowSnapshot(null)).toBe(null);
    expect(shallowSnapshot("hi")).toBe("hi");
  });

  it("keeps top-level primitive fields as-is", () => {
    expect(shallowSnapshot({ counter: 3, name: "x" })).toEqual({
      counter: 3,
      name: "x"
    });
  });

  it("summarizes nested objects, arrays, maps and sets without recursing", () => {
    const snap = shallowSnapshot({
      nested: { a: 1 },
      list: [1, 2, 3],
      m: new Map([["a", 1]]),
      s: new Set([1, 2])
    }) as Record<string, unknown>;
    expect(snap.nested).toBe("[object]");
    expect(snap.list).toBe("[array(3)]");
    expect(snap.m).toBe("[map(1)]");
    expect(snap.s).toBe("[set(2)]");
  });

  it("truncates long strings", () => {
    const snap = shallowSnapshot({ big: "x".repeat(300) }) as Record<
      string,
      unknown
    >;
    expect(snap.big).toMatch(/…\(truncated\)$/);
    expect((snap.big as string).length).toBeLessThan(230);
  });

  it("caps the number of top-level keys", () => {
    const state: Record<string, number> = {};
    for (let i = 0; i < 60; i++) state[`k${i}`] = i;
    const snap = shallowSnapshot(state) as Record<string, unknown>;
    expect(Object.keys(snap).length).toBe(51);
    expect(snap["…"]).toBe("10 more keys");
  });

  it("summarizes arrays passed directly as the root value", () => {
    expect(shallowSnapshot([1, 2, 3])).toBe("[array(3)]");
  });

  it("falls back to a truncated marker when the snapshot is too large", () => {
    const state: Record<string, string> = {};
    for (let i = 0; i < 40; i++) state[`k${i}`] = "y".repeat(199);
    const snap = shallowSnapshot(state) as Record<string, unknown>;
    expect(snap["[truncated]"]).toBe(true);
    expect(Array.isArray(snap.keys)).toBe(true);
  });
});
