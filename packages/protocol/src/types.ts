// SDK의 BaseEvent를 구조적으로 미러링한 타입
// protocol 패키지는 제로 의존성 계약이라 agents/observability에서 import하지 않는다
// client 패키지는 SDK 타입을 직접 import하며 이 타입과 구조적으로 호환된다
export type ObservabilityEventLike = {
  type: string;
  agent?: string;
  name?: string;
  payload: Record<string, unknown>;
  timestamp: number;
};

export type EventEnvelope = {
  v: 1;
  seq: number;
  receivedAt: number;
  channel: string;
  event: ObservabilityEventLike;
};

export type SessionHeader = {
  v: 1;
  kind: "session";
  createdAt: number;
  sdkVersion?: string;
  tool: string;
};

export type SessionRecord = SessionHeader | EventEnvelope;

export type IngestBatch = {
  v: 1;
  events: Array<{
    channel: string;
    event: ObservabilityEventLike;
  }>;
};

export type ServerMessage =
  | {
      kind: "hello";
      seq: number;
      dropped: number;
      total: number;
    }
  | {
      kind: "events";
      envelopes: EventEnvelope[];
      dropped: number;
    };

export const PROTOCOL_VERSION = 1 as const;
export const DEFAULT_INGEST_PORT = 4111;
export const DEFAULT_UI_PORT = 4110;
export const DEFAULT_INGEST_PATH = "/ingest";

export function isSessionHeader(r: SessionRecord): r is SessionHeader {
  return "kind" in r && r.kind === "session";
}

export function instanceKey(
  e: Pick<ObservabilityEventLike, "agent" | "name">
): string {
  if (!e.agent && !e.name) return "(system)";
  return `${e.agent ?? "?"}/${e.name ?? "?"}`;
}
