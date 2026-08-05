import { useMemo } from "react";
import { buildScheduleBoard, type ScheduleCard } from "./domain";
import { formatTime } from "./format";
import { useT } from "./i18n/useT";
import type { MessageKey } from "./i18n";
import { useStore } from "./store";
import { useInstanceScope } from "./useInstanceScope";

function stateKey(state: ScheduleCard["state"]): MessageKey {
  return `schedule.state.${state}`;
}

export function SchedulesView() {
  const { effectiveKey, rows } = useInstanceScope();
  const select = useStore((s) => s.select);
  const selectedSeq = useStore((s) => s.selectedSeq);
  const t = useT();

  const board = useMemo(() => buildScheduleBoard(rows), [rows]);

  if (effectiveKey === null) {
    return <div className="empty">{t("timeline.noInstance")}</div>;
  }
  if (board.cards.length === 0 && board.warnings.length === 0) {
    return <div className="empty">{t("schedules.empty")}</div>;
  }

  return (
    <div className="domain-view">
      {board.warnings.map((warning) => (
        <div
          key={warning.seq}
          className={
            warning.seq === selectedSeq
              ? "banner warn selected"
              : "banner warn"
          }
          onClick={() =>
            select(warning.seq === selectedSeq ? null : warning.seq)
          }
        >
          <span className="col-time">{formatTime(warning.timestamp)}</span>
          {t("schedules.warning", {
            callback: warning.callback,
            count: warning.count,
            scheduleType: warning.scheduleType ?? "?"
          })}
        </div>
      ))}
      <div className="card-grid">
        {board.cards.map((card) => (
          <button
            key={`${card.kind}:${card.id}`}
            type="button"
            className={
              card.lastSeq === selectedSeq
                ? "card schedule-card selected"
                : "card schedule-card"
            }
            onClick={() =>
              select(card.lastSeq === selectedSeq ? null : card.lastSeq)
            }
          >
            <div className="card-head">
              <span className={`pill status-chip sched-${card.state}`}>
                {t(stateKey(card.state))}
              </span>
              {card.kind === "queue" && (
                <span className="pill">{t("schedules.queue")}</span>
              )}
              <span className="card-title">{card.callback ?? "?"}</span>
            </div>
            <div className="card-body">
              <span className="card-meta">{card.id}</span>
              {card.attempt !== null && (
                <span className="card-meta">
                  {t("incident.attempts", {
                    attempt: card.attempt,
                    max: card.maxAttempts ?? "?"
                  })}
                </span>
              )}
              {card.error !== null && (
                <span className="card-meta warn">{card.error}</span>
              )}
              <span className="card-meta">
                {formatTime(card.lastTimestamp)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
