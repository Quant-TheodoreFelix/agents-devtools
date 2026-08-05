const MAX_KEYS = 50;
const MAX_STRING_LENGTH = 200;
const MAX_SNAPSHOT_BYTES = 8_000;

function summarizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}…(truncated)`;
    }
    return value;
  }
  if (Array.isArray(value)) return `[array(${value.length})]`;
  if (value instanceof Map) return `[map(${value.size})]`;
  if (value instanceof Set) return `[set(${value.size})]`;
  return "[object]";
}

// state는 사용자가 직접 opt-in한 경우에만 방출되므로 재귀 없이 최상위 필드만 요약한다
export function shallowSnapshot(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return summarizeValue(value);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const truncatedKeys = entries.length > MAX_KEYS;
  const out: Record<string, unknown> = {};
  for (const [key, v] of entries.slice(0, MAX_KEYS)) {
    out[key] = summarizeValue(v);
  }
  if (truncatedKeys) out["…"] = `${entries.length - MAX_KEYS} more keys`;

  try {
    if (JSON.stringify(out).length > MAX_SNAPSHOT_BYTES) {
      return { "[truncated]": true, keys: entries.map(([k]) => k) };
    }
  } catch {
    return { "[unserializable]": true };
  }
  return out;
}
