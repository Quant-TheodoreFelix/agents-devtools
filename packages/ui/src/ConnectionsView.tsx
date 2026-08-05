import { useMemo } from "react";
import { buildConnections } from "./domain";
import { formatTime } from "./format";
import { useT } from "./i18n/useT";
import { useStore } from "./store";
import { useInstanceScope } from "./useInstanceScope";

export function ConnectionsView() {
  const { effectiveKey, rows } = useInstanceScope();
  const select = useStore((s) => s.select);
  const selectedSeq = useStore((s) => s.selectedSeq);
  const t = useT();

  const view = useMemo(() => buildConnections(rows), [rows]);

  if (effectiveKey === null) {
    return <div className="empty">{t("timeline.noInstance")}</div>;
  }
  if (view.connections.length === 0 && view.destroyCount === 0) {
    return <div className="empty">{t("connections.empty")}</div>;
  }

  return (
    <div className="domain-view">
      <div className="table-wrap conn-table">
        <div className="table-head">
          <span className="col-conn">{t("table.connection")}</span>
          <span className="col-time">{t("table.connected")}</span>
          <span className="col-time">{t("table.disconnected")}</span>
          <span className="col-close">{t("table.closeInfo")}</span>
          <span className="col-duration">{t("table.duration")}</span>
        </div>
        <div>
          {view.connections.map((conn) => {
            const seq = conn.connectSeq ?? conn.disconnectSeq ?? 0;
            const width =
              conn.durationMs !== null && view.maxDurationMs > 0
                ? Math.max(
                    2,
                    Math.round((conn.durationMs / view.maxDurationMs) * 100)
                  )
                : null;
            return (
              <div
                key={`${conn.connectionId}:${seq}`}
                className={
                  seq === selectedSeq ? "row conn-row selected" : "row conn-row"
                }
                onClick={() => select(seq === selectedSeq ? null : seq)}
              >
                <span className="col-conn">{conn.connectionId}</span>
                <span className="col-time">
                  {conn.connectTimestamp !== null
                    ? formatTime(conn.connectTimestamp)
                    : "-"}
                </span>
                <span className="col-time">
                  {conn.disconnectTimestamp !== null
                    ? formatTime(conn.disconnectTimestamp)
                    : "-"}
                </span>
                <span className="col-close">
                  {conn.code !== null ? `${conn.code}` : ""}
                  {conn.reason !== null && conn.reason !== ""
                    ? ` ${conn.reason}`
                    : ""}
                </span>
                <span className="col-duration">
                  {conn.open ? (
                    <span className="pill status-chip conn-open">
                      {t("connections.open")}
                    </span>
                  ) : width !== null ? (
                    <>
                      <span
                        className="duration-bar"
                        style={{ width: `${width}%` }}
                      />
                      <span className="duration-label">
                        {conn.durationMs}ms
                      </span>
                    </>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {view.destroyCount > 0 && (
        <div className="card-meta">
          {t("connections.destroyed", { count: view.destroyCount })}
        </div>
      )}
    </div>
  );
}
