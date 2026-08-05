export const CHANNEL_KEYS = {
  state: "agents:state",
  rpc: "agents:rpc",
  message: "agents:message",
  chat: "agents:chat",
  transcript: "agents:transcript",
  fiber: "agents:fiber",
  agentTool: "agents:agent_tool",
  schedule: "agents:schedule",
  lifecycle: "agents:lifecycle",
  workflow: "agents:workflow",
  mcp: "agents:mcp",
  email: "agents:email",
  channel: "agents:channel"
} as const;

export type ChannelKey = keyof typeof CHANNEL_KEYS;
export type RawChannel = (typeof CHANNEL_KEYS)[ChannelKey];

export const RAW_CHANNELS: readonly RawChannel[] = Object.values(CHANNEL_KEYS);

const RAW_TO_KEY = new Map<string, ChannelKey>(
  (Object.entries(CHANNEL_KEYS) as Array<[ChannelKey, RawChannel]>).map(
    ([key, raw]) => [raw, key]
  )
);

export function channelKeyForRaw(raw: string): ChannelKey | undefined {
  return RAW_TO_KEY.get(raw);
}

// SDK observability/index.ts의 getChannel 분기 순서를 그대로 미러링
export function channelForType(type: string): RawChannel {
  if (type.startsWith("mcp:")) return "agents:mcp";
  if (type.startsWith("workflow:")) return "agents:workflow";
  if (type.startsWith("fiber:")) return "agents:fiber";
  if (type.startsWith("transcript:") || type.startsWith("chat:transcript:")) {
    return "agents:transcript";
  }
  if (type.startsWith("chat:")) return "agents:chat";
  if (type.startsWith("agent_tool:")) return "agents:agent_tool";
  if (type.startsWith("schedule:") || type.startsWith("queue:")) {
    return "agents:schedule";
  }
  if (
    type.startsWith("message:") ||
    type.startsWith("tool:") ||
    type.startsWith("submission:") ||
    type.startsWith("action:")
  ) {
    return "agents:message";
  }
  if (type === "rpc" || type.startsWith("rpc:")) return "agents:rpc";
  if (type.startsWith("state:")) return "agents:state";
  if (type.startsWith("email:")) return "agents:email";
  if (type.startsWith("channel:") || type.startsWith("notice:")) {
    return "agents:channel";
  }
  return "agents:lifecycle";
}
