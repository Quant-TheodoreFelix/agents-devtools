import { useMemo } from "react";
import {
  buildIncidents,
  buildTurns,
  type Incident,
  type IncidentItem,
  type Turn
} from "./domain";
import { channelClass, channelShortName, formatTime, payloadPreview } from "./format";
import { useT } from "./i18n/useT";
import type { MessageKey } from "./i18n";
import { useStore } from "./store";
import { useInstanceScope } from "./useInstanceScope";

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

function statusKey(status: Incident["status"]): MessageKey {
  return `incident.status.${status}`;
}

function EventRows({ items }: { items: IncidentItem[] }) {
  const select = useStore((s) => s.select);
  const selectedSeq = useStore((s) => s.selectedSeq);
  return (
    <div className="chain-rows">
      {items.map(({ row, severity }) => {
        const env = row.env;
        return (
          <div
            key={env.seq}
            className={[
              "row",
              env.seq === selectedSeq ? "selected" : "",
              severity === "error" ? "error" : "",
              severity === "warn" ? "warn" : ""
            ].join(" ")}
            onClick={() => select(env.seq === selectedSeq ? null : env.seq)}
          >
            <span className="col-time">{formatTime(env.event.timestamp)}</span>
            <span className="col-chip">
              <span className={channelClass(env.channel)}>
                {channelShortName(env.channel)}
              </span>
            </span>
            <span className="col-type">{env.event.type}</span>
            <span className="col-payload">
              {payloadPreview(env.event.payload)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const t = useT();
  return (
    <details className="card" open={incident.status !== "completed"}>
      <summary className="card-head">
        <span className={`pill status-chip incident-${incident.status}`}>
          {t(statusKey(incident.status))}
        </span>
        <span className="card-title">{shortId(incident.incidentId)}</span>
        {incident.recoveryKind !== null && (
          <span className="pill">{incident.recoveryKind}</span>
        )}
        <span className="card-meta">
          {t("incident.attempts", {
            attempt: incident.attempt,
            max: incident.maxAttempts ?? "?"
          })}
        </span>
        {incident.reason !== null && (
          <span className="card-meta warn">
            {t("incident.reason", { reason: incident.reason })}
          </span>
        )}
      </summary>
      <EventRows items={incident.items} />
    </details>
  );
}

function TurnCard({ turn }: { turn: Turn }) {
  const t = useT();
  return (
    <details className="card" open={turn.status !== "completed"}>
      <summary className="card-head">
        <span
          className={`pill status-chip turn-${
            turn.status === "completed" ? "completed" : turn.status === "error" ? "failed" : "active"
          }`}
        >
          {turn.status}
        </span>
        <span className="card-title">
          {turn.requestId !== null
            ? shortId(turn.requestId)
            : t("chat.noRequestId")}
        </span>
        {turn.trigger !== null && <span className="pill">{turn.trigger}</span>}
        {turn.durationMs !== null && (
          <span className="card-meta">{turn.durationMs}ms</span>
        )}
        {turn.repairedBadge !== null && (
          <span className="pill repaired" title={t("chat.repaired")}>
            {t("chat.repaired")} -{turn.repairedBadge.removedToolCalls} ~
            {turn.repairedBadge.normalizedInputs}
          </span>
        )}
        {turn.error !== null && (
          <span className="card-meta warn">{turn.error}</span>
        )}
      </summary>
      <EventRows items={turn.items} />
    </details>
  );
}

export function ChatView() {
  const { effectiveKey, rows } = useInstanceScope();
  const t = useT();

  const incidents = useMemo(() => buildIncidents(rows), [rows]);
  const turns = useMemo(() => buildTurns(rows), [rows]);

  if (effectiveKey === null) {
    return <div className="empty">{t("timeline.noInstance")}</div>;
  }
  if (incidents.length === 0 && turns.length === 0) {
    return <div className="empty">{t("chat.empty")}</div>;
  }

  return (
    <div className="domain-view">
      {incidents.length > 0 && (
        <section>
          <h2 className="section-title">{t("chat.incidents")}</h2>
          {incidents.map((incident) => (
            <IncidentCard key={incident.incidentId} incident={incident} />
          ))}
        </section>
      )}
      {turns.length > 0 && (
        <section>
          <h2 className="section-title">{t("chat.turns")}</h2>
          {turns.map((turn) => (
            <TurnCard key={turn.requestId ?? "(none)"} turn={turn} />
          ))}
        </section>
      )}
    </div>
  );
}
