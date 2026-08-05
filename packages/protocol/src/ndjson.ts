import type { SessionHeader, SessionRecord } from "./types";

export function serializeRecord(record: SessionRecord): string {
  return JSON.stringify(record);
}

export function makeSessionHeader(options: {
  createdAt: number;
  tool: string;
  sdkVersion?: string;
}): SessionHeader {
  return {
    v: 1,
    kind: "session",
    createdAt: options.createdAt,
    tool: options.tool,
    ...(options.sdkVersion ? { sdkVersion: options.sdkVersion } : {})
  };
}

export type ParseResult = {
  records: SessionRecord[];
  errors: number;
};

export function parseRecords(text: string): ParseResult {
  const records: SessionRecord[] = [];
  let errors = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "v" in parsed &&
        (parsed as { v: unknown }).v === 1
      ) {
        records.push(parsed as SessionRecord);
      } else {
        errors += 1;
      }
    } catch {
      errors += 1;
    }
  }
  return { records, errors };
}
