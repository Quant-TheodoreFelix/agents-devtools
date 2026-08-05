import type { Row } from "./store";
import { severityForType, type Severity } from "./timeline";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type IncidentStatus =
  | "active"
  | "completed"
  | "exhausted"
  | "failed"
  | "skipped";

export type IncidentItem = {
  row: Row;
  severity: Severity;
};

export type Incident = {
  incidentId: string;
  requestId: string | null;
  recoveryKind: string | null;
  attempt: number;
  maxAttempts: number | null;
  status: IncidentStatus;
  reason: string | null;
  items: IncidentItem[];
  firstSeq: number;
  lastSeq: number;
};

const INCIDENT_TERMINAL: Record<string, IncidentStatus> = {
  "chat:recovery:completed": "completed",
  "chat:recovery:exhausted": "exhausted",
  "chat:recovery:failed": "failed",
  "chat:recovery:skipped": "skipped"
};

export function buildIncidents(rows: Row[]): Incident[] {
  const byId = new Map<string, Incident>();
  const byRequestId = new Map<string, Incident[]>();
  const pendingByRequestId = new Map<string, Row[]>();

  const attach = (incident: Incident, row: Row): void => {
    incident.items.push({
      row,
      severity: severityForType(row.env.event.type)
    });
    incident.lastSeq = row.env.seq;
  };

  for (const row of rows) {
    const { type, payload } = row.env.event;
    const incidentId = str(payload.incidentId);

    if (incidentId !== null && type.startsWith("chat:recovery:")) {
      let incident = byId.get(incidentId);
      if (incident === undefined) {
        incident = {
          incidentId,
          requestId: null,
          recoveryKind: null,
          attempt: 0,
          maxAttempts: null,
          status: "active",
          reason: null,
          items: [],
          firstSeq: row.env.seq,
          lastSeq: row.env.seq
        };
        byId.set(incidentId, incident);
      }
      const requestId = str(payload.requestId);
      if (requestId !== null && incident.requestId === null) {
        incident.requestId = requestId;
        const list = byRequestId.get(requestId) ?? [];
        list.push(incident);
        byRequestId.set(requestId, list);
        const pending = pendingByRequestId.get(requestId);
        if (pending !== undefined) {
          for (const p of pending) attach(incident, p);
          pendingByRequestId.delete(requestId);
          incident.items.sort((a, b) => a.row.env.seq - b.row.env.seq);
          incident.firstSeq = incident.items[0]?.row.env.seq ?? incident.firstSeq;
        }
      }
      incident.recoveryKind = str(payload.recoveryKind) ?? incident.recoveryKind;
      incident.attempt = Math.max(incident.attempt, num(payload.attempt) ?? 0);
      incident.maxAttempts = num(payload.maxAttempts) ?? incident.maxAttempts;
      const terminal = INCIDENT_TERMINAL[type];
      if (terminal !== undefined) {
        incident.status = terminal;
        incident.reason = str(payload.reason) ?? incident.reason;
      }
      attach(incident, row);
      continue;
    }

    if (type === "chat:stream:stalled" || type === "chat:request:failed") {
      const requestId = str(payload.requestId);
      if (requestId === null) continue;
      const owners = byRequestId.get(requestId);
      if (owners !== undefined && owners.length > 0) {
        attach(owners[owners.length - 1]!, row);
      } else {
        const pending = pendingByRequestId.get(requestId) ?? [];
        pending.push(row);
        pendingByRequestId.set(requestId, pending);
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.lastSeq - a.lastSeq);
}

export type TurnStatus = "streaming" | "completed" | "error" | string;

export type Turn = {
  requestId: string | null;
  status: TurnStatus;
  trigger: string | null;
  durationMs: number | null;
  error: string | null;
  repairedBadge: { removedToolCalls: number; normalizedInputs: number } | null;
  items: IncidentItem[];
  firstSeq: number;
  lastSeq: number;
};

const CHAT_VIEW_CHANNELS = new Set([
  "agents:message",
  "agents:chat",
  "agents:transcript"
]);

export function buildTurns(rows: Row[]): Turn[] {
  const byRequestId = new Map<string | null, Turn>();
  const order: Turn[] = [];

  for (const row of rows) {
    if (!CHAT_VIEW_CHANNELS.has(row.env.channel)) continue;
    const { type, payload } = row.env.event;
    if (type.startsWith("chat:recovery:")) continue;

    const requestId = str(payload.requestId);
    let turn = byRequestId.get(requestId);
    if (turn === undefined) {
      turn = {
        requestId,
        status: "streaming",
        trigger: null,
        durationMs: null,
        error: null,
        repairedBadge: null,
        items: [],
        firstSeq: row.env.seq,
        lastSeq: row.env.seq
      };
      byRequestId.set(requestId, turn);
      order.push(turn);
    }
    turn.items.push({ row, severity: severityForType(type) });
    turn.lastSeq = row.env.seq;

    if (type === "chat:turn:start") {
      turn.trigger = str(payload.trigger) ?? turn.trigger;
    }
    if (type === "chat:turn:finish") {
      turn.status = str(payload.status) ?? "completed";
      turn.durationMs = num(payload.durationMs);
      turn.error = str(payload.error);
    }
    if (type === "chat:transcript:repaired") {
      turn.repairedBadge = {
        removedToolCalls: num(payload.removedToolCalls) ?? 0,
        normalizedInputs: num(payload.normalizedInputs) ?? 0
      };
    }
  }

  return order.sort((a, b) => b.lastSeq - a.lastSeq);
}

export type ScheduleCardState =
  | "pending"
  | "executed"
  | "retrying"
  | "failed"
  | "cancelled";

export type ScheduleCard = {
  id: string;
  kind: "schedule" | "queue";
  callback: string | null;
  state: ScheduleCardState;
  attempt: number | null;
  maxAttempts: number | null;
  error: string | null;
  eventCount: number;
  firstSeq: number;
  lastSeq: number;
  lastTimestamp: number;
};

export type DuplicateWarning = {
  callback: string;
  count: number;
  scheduleType: string | null;
  seq: number;
  timestamp: number;
};

export type ScheduleBoard = {
  cards: ScheduleCard[];
  warnings: DuplicateWarning[];
};

const SCHEDULE_STATE: Record<string, ScheduleCardState> = {
  create: "pending",
  execute: "executed",
  retry: "retrying",
  error: "failed",
  cancel: "cancelled"
};

export function buildScheduleBoard(rows: Row[]): ScheduleBoard {
  const byId = new Map<string, ScheduleCard>();
  const warnings: DuplicateWarning[] = [];

  for (const row of rows) {
    if (row.env.channel !== "agents:schedule") continue;
    const { type, payload } = row.env.event;

    if (type === "schedule:duplicate_warning") {
      warnings.push({
        callback: str(payload.callback) ?? "?",
        count: num(payload.count) ?? 0,
        scheduleType: str(payload.type),
        seq: row.env.seq,
        timestamp: row.env.event.timestamp
      });
      continue;
    }

    const match = /^(schedule|queue):([a-z_]+)$/.exec(type);
    if (match === null) continue;
    const kind = match[1] as "schedule" | "queue";
    const action = match[2]!;
    const state = SCHEDULE_STATE[action];
    if (state === undefined) continue;
    const id = str(payload.id);
    if (id === null) continue;

    const cardKey = `${kind}:${id}`;
    let card = byId.get(cardKey);
    if (card === undefined) {
      card = {
        id,
        kind,
        callback: null,
        state: "pending",
        attempt: null,
        maxAttempts: null,
        error: null,
        eventCount: 0,
        firstSeq: row.env.seq,
        lastSeq: row.env.seq,
        lastTimestamp: row.env.event.timestamp
      };
      byId.set(cardKey, card);
    }
    card.callback = str(payload.callback) ?? card.callback;
    card.state = state;
    card.attempt = num(payload.attempt) ?? num(payload.attempts) ?? card.attempt;
    card.maxAttempts = num(payload.maxAttempts) ?? card.maxAttempts;
    card.error = str(payload.error) ?? (state === "failed" ? card.error : null);
    card.eventCount += 1;
    card.lastSeq = row.env.seq;
    card.lastTimestamp = row.env.event.timestamp;
  }

  return {
    cards: [...byId.values()].sort((a, b) => b.lastSeq - a.lastSeq),
    warnings: warnings.sort((a, b) => b.seq - a.seq)
  };
}

export type Connection = {
  connectionId: string;
  connectSeq: number | null;
  connectTimestamp: number | null;
  disconnectSeq: number | null;
  disconnectTimestamp: number | null;
  code: number | null;
  reason: string | null;
  durationMs: number | null;
  open: boolean;
};

export type ConnectionsView = {
  connections: Connection[];
  destroyCount: number;
  maxDurationMs: number;
};

export function buildConnections(rows: Row[]): ConnectionsView {
  const byConnectionId = new Map<string, Connection[]>();
  const order: Connection[] = [];
  let destroyCount = 0;

  const openFor = (connectionId: string): Connection | null => {
    const list = byConnectionId.get(connectionId);
    if (list === undefined) return null;
    const last = list[list.length - 1];
    return last !== undefined && last.open ? last : null;
  };

  const push = (connectionId: string, conn: Connection): void => {
    const list = byConnectionId.get(connectionId) ?? [];
    list.push(conn);
    byConnectionId.set(connectionId, list);
    order.push(conn);
  };

  for (const row of rows) {
    if (row.env.channel !== "agents:lifecycle") continue;
    const { type, payload } = row.env.event;

    if (type === "destroy") {
      destroyCount += 1;
      continue;
    }

    const connectionId = str(payload.connectionId);
    if (connectionId === null) continue;

    if (type === "connect") {
      push(connectionId, {
        connectionId,
        connectSeq: row.env.seq,
        connectTimestamp: row.env.event.timestamp,
        disconnectSeq: null,
        disconnectTimestamp: null,
        code: null,
        reason: null,
        durationMs: null,
        open: true
      });
      continue;
    }

    if (type === "disconnect") {
      const open = openFor(connectionId);
      if (open !== null) {
        open.disconnectSeq = row.env.seq;
        open.disconnectTimestamp = row.env.event.timestamp;
        open.code = num(payload.code);
        open.reason = str(payload.reason);
        open.durationMs =
          open.connectTimestamp !== null
            ? Math.max(0, row.env.event.timestamp - open.connectTimestamp)
            : null;
        open.open = false;
      } else {
        push(connectionId, {
          connectionId,
          connectSeq: null,
          connectTimestamp: null,
          disconnectSeq: row.env.seq,
          disconnectTimestamp: row.env.event.timestamp,
          code: num(payload.code),
          reason: str(payload.reason),
          durationMs: null,
          open: false
        });
      }
    }
  }

  const maxDurationMs = order.reduce(
    (max, c) => Math.max(max, c.durationMs ?? 0),
    0
  );

  return {
    connections: order.reverse(),
    destroyCount,
    maxDurationMs
  };
}
