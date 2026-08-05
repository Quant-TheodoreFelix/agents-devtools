import { describe, expect, it } from "vitest";
import {
  CHANNEL_KEYS,
  RAW_CHANNELS,
  channelForType,
  channelKeyForRaw
} from "../src/channels";

describe("channelForType", () => {
  const cases: Array<[string, string]> = [
    ["rpc", "agents:rpc"],
    ["rpc:error", "agents:rpc"],
    ["state:update", "agents:state"],
    ["message:request", "agents:message"],
    ["tool:result", "agents:message"],
    ["submission:create", "agents:message"],
    ["action:pause:approved", "agents:message"],
    ["chat:request:failed", "agents:chat"],
    ["chat:recovery:detected", "agents:chat"],
    ["chat:stream:stalled", "agents:chat"],
    ["chat:transcript:repaired", "agents:transcript"],
    ["fiber:run:started", "agents:fiber"],
    ["agent_tool:recovery:failed", "agents:agent_tool"],
    ["schedule:create", "agents:schedule"],
    ["schedule:duplicate_warning", "agents:schedule"],
    ["queue:create", "agents:schedule"],
    ["workflow:start", "agents:workflow"],
    ["mcp:client:connect", "agents:mcp"],
    ["email:receive", "agents:email"],
    ["channel:subscribe", "agents:channel"],
    ["notice:failed", "agents:channel"],
    ["connect", "agents:lifecycle"],
    ["disconnect", "agents:lifecycle"],
    ["destroy", "agents:lifecycle"],
    ["future:unknown:type", "agents:lifecycle"]
  ];

  it.each(cases)("%s -> %s", (type, channel) => {
    expect(channelForType(type)).toBe(channel);
  });
});

describe("channel tables", () => {
  it("has 13 channels", () => {
    expect(RAW_CHANNELS).toHaveLength(13);
  });

  it("maps camelCase key to snake_case raw for agentTool", () => {
    expect(CHANNEL_KEYS.agentTool).toBe("agents:agent_tool");
    expect(channelKeyForRaw("agents:agent_tool")).toBe("agentTool");
  });

  it("returns undefined for unknown raw channel", () => {
    expect(channelKeyForRaw("agents:nope")).toBeUndefined();
  });
});
