import { describe, expect, it } from "vitest";
import {
  makeSessionHeader,
  parseRecords,
  serializeRecord
} from "../src/ndjson";
import { isSessionHeader, type EventEnvelope } from "../src/types";

const envelope: EventEnvelope = {
  v: 1,
  seq: 1042,
  receivedAt: 1758005142801,
  channel: "agents:rpc",
  event: {
    type: "rpc",
    agent: "MyAgent",
    name: "user-123",
    payload: { method: "getWeather" },
    timestamp: 1758005142787
  }
};

describe("ndjson round-trip", () => {
  it("serializes and parses header plus envelopes", () => {
    const header = makeSessionHeader({
      createdAt: 1758005142000,
      tool: "agents-devtools@0.1.0",
      sdkVersion: "0.20.1"
    });
    const text = [
      serializeRecord(header),
      serializeRecord(envelope),
      serializeRecord({ ...envelope, seq: 1043 })
    ].join("\n");

    const { records, errors } = parseRecords(`${text}\n`);
    expect(errors).toBe(0);
    expect(records).toHaveLength(3);
    expect(isSessionHeader(records[0]!)).toBe(true);
    expect(records[1]).toEqual(envelope);
  });

  it("counts malformed lines as errors without throwing", () => {
    const text = [
      serializeRecord(envelope),
      "{ not json",
      '{"v":2,"something":"else"}',
      ""
    ].join("\n");

    const { records, errors } = parseRecords(text);
    expect(records).toHaveLength(1);
    expect(errors).toBe(2);
  });

  it("keeps instance grouping stable for events without agent metadata", () => {
    const { records } = parseRecords(
      serializeRecord({
        ...envelope,
        event: { ...envelope.event, agent: undefined, name: undefined }
      })
    );
    expect(records).toHaveLength(1);
  });
});
