import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  channelClass,
  channelShortName,
  formatTime,
  payloadPreview
} from "./format";
import { useT } from "./i18n/useT";
import { useStore } from "./store";
import { buildTimeline, type TimelineItem } from "./timeline";
import { useInstanceScope } from "./useInstanceScope";

function laneTitle(item: TimelineItem): string | null {
  const span = item.span;
  if (span === null) return null;
  if (item.row.env.event.type === "fiber:run:started") {
    return span.fiberName;
  }
  if (span.elapsedMs !== null) return `${span.elapsedMs}ms`;
  return null;
}

export function TimelineView() {
  const select = useStore((s) => s.select);
  const selectedSeq = useStore((s) => s.selectedSeq);
  const { effectiveKey, rows: instanceRows } = useInstanceScope();
  const t = useT();
  const [follow, setFollow] = useState(true);

  const timeline = useMemo(() => {
    if (effectiveKey === null) return null;
    return buildTimeline(instanceRows);
  }, [instanceRows, effectiveKey]);

  const items = timeline?.items ?? [];
  const laneCount = timeline?.laneCount ?? 0;

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 20
  });

  useEffect(() => {
    if (follow && items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { align: "end" });
    }
  }, [items.length, follow, virtualizer]);

  if (effectiveKey === null) {
    return <div className="empty">{t("timeline.noInstance")}</div>;
  }

  return (
    <div className="table-wrap">
      <div className="table-head">
        <span className="col-time">{t("table.time")}</span>
        <span
          className="col-lanes"
          style={{ width: Math.max(laneCount, 1) * 14 }}
        />
        <span className="col-chip">{t("table.channel")}</span>
        <span className="col-type">{t("table.type")}</span>
        <span className="col-payload">{t("table.payload")}</span>
        <span className="timeline-instance">{effectiveKey}</span>
        <label className="follow">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          {t("table.follow")}
        </label>
      </div>
      <div className="table-body" ref={parentRef}>
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative"
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index]!;
            const env = item.row.env;
            const title = laneTitle(item);
            return (
              <div
                key={env.seq}
                className={[
                  "row",
                  env.seq === selectedSeq ? "selected" : "",
                  item.severity === "error" ? "error" : "",
                  item.severity === "warn" ? "warn" : ""
                ].join(" ")}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualItem.size,
                  transform: `translateY(${virtualItem.start}px)`
                }}
                onClick={() => select(env.seq === selectedSeq ? null : env.seq)}
              >
                <span className="col-time">
                  {formatTime(env.event.timestamp)}
                </span>
                <span
                  className="col-lanes"
                  style={{ width: Math.max(laneCount, 1) * 14 }}
                >
                  {item.lanes.map((cell, lane) => (
                    <span
                      key={lane}
                      className={
                        cell === null
                          ? "lane"
                          : `lane lane-${cell.mark} lane-${cell.outcome}`
                      }
                    />
                  ))}
                </span>
                <span className="col-chip">
                  <span className={channelClass(env.channel)}>
                    {channelShortName(env.channel)}
                  </span>
                </span>
                <span className="col-type">
                  {env.event.type}
                  {title !== null && (
                    <span className="span-label"> {title}</span>
                  )}
                </span>
                <span className="col-payload">
                  {payloadPreview(env.event.payload)}
                </span>
              </div>
            );
          })}
        </div>
        {items.length === 0 && (
          <div className="empty">{t("timeline.empty")}</div>
        )}
      </div>
    </div>
  );
}
