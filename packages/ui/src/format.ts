export function channelShortName(raw: string): string {
  return raw.startsWith("agents:") ? raw.slice("agents:".length) : raw;
}

export function channelClass(raw: string): string {
  return `chip chip-${channelShortName(raw).replace(/[^a-z_]/g, "")}`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function payloadPreview(payload: Record<string, unknown>): string {
  const text = JSON.stringify(payload);
  if (text === "{}") return "";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
