import {
  isSessionHeader,
  makeSessionHeader,
  parseRecords,
  serializeRecord,
  type EventEnvelope,
  type SessionHeader
} from "@agents-devtools/protocol";
import type { Row } from "./store";

export const TOOL_ID = "agents-devtools/ui@0.1.1";

export function buildSessionText(rows: Row[], createdAt: number): string {
  const header = makeSessionHeader({ createdAt, tool: TOOL_ID });
  const lines = [serializeRecord(header)];
  for (const row of rows) lines.push(serializeRecord(row.env));
  return `${lines.join("\n")}\n`;
}

export type ImportedSession = {
  header: SessionHeader | null;
  envelopes: EventEnvelope[];
  errors: number;
};

export function parseSessionText(text: string): ImportedSession {
  const { records, errors } = parseRecords(text);
  let header: SessionHeader | null = null;
  const envelopes: EventEnvelope[] = [];
  for (const record of records) {
    if (isSessionHeader(record)) {
      header = record;
    } else {
      envelopes.push(record);
    }
  }
  envelopes.sort((a, b) => a.seq - b.seq);
  return { header, envelopes, errors };
}
