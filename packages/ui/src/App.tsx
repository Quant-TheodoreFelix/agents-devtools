import { instanceKey, RAW_CHANNELS } from "@agents-devtools/protocol";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  channelClass,
  channelShortName,
  formatTime,
  payloadPreview
} from "./format";
import { Sidebar } from "./Sidebar";
import { useStore, type Row, type Tab } from "./store";
import { severityForType } from "./timeline";
import { TimelineView } from "./TimelineView";

function StatusDot() {
  const status = useStore((s) => s.status);
  return (
    <span className={`status status-${status}`} title={status}>
      ● {status}
    </span>
  );
}

function Header() {
  const dropped = useStore((s) => s.dropped);
  const total = useStore((s) => s.rows.length);
  const clear = useStore((s) => s.clear);
  return (
    <header className="header">
      <h1>agents-devtools</h1>
      <StatusDot />
      <span className="meta">{total.toLocaleString()} events</span>
      {dropped > 0 && (
        <span className="meta warn">{dropped.toLocaleString()} dropped</span>
      )}
      <span className="spacer" />
      <button type="button" onClick={clear}>
        Clear
      </button>
    </header>
  );
}

function FilterBar() {
  const channelFilter = useStore((s) => s.channelFilter);
  const toggleChannel = useStore((s) => s.toggleChannel);
  const clearChannelFilter = useStore((s) => s.clearChannelFilter);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    const handle = setTimeout(() => setSearch(draft), 150);
    return () => clearTimeout(handle);
  }, [draft, setSearch]);

  return (
    <div className="filterbar">
      <button
        type="button"
        className={channelFilter.length === 0 ? "chip chip-all active" : "chip chip-all"}
        onClick={clearChannelFilter}
      >
        all
      </button>
      {RAW_CHANNELS.map((raw) => (
        <button
          key={raw}
          type="button"
          className={
            channelFilter.includes(raw)
              ? `${channelClass(raw)} active`
              : channelClass(raw)
          }
          onClick={() => toggleChannel(raw)}
        >
          {channelShortName(raw)}
        </button>
      ))}
      <input
        className="search"
        placeholder="search type / agent / payload…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}

function useFilteredRows(): Row[] {
  const rows = useStore((s) => s.rows);
  const channelFilter = useStore((s) => s.channelFilter);
  const search = useStore((s) => s.search);
  return useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        channelFilter.length > 0 &&
        !channelFilter.includes(row.env.channel)
      ) {
        return false;
      }
      if (query !== "" && !row.text.includes(query)) return false;
      return true;
    });
  }, [rows, channelFilter, search]);
}

function EventTable({ rows }: { rows: Row[] }) {
  const select = useStore((s) => s.select);
  const selectedSeq = useStore((s) => s.selectedSeq);
  const parentRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 20
  });

  useEffect(() => {
    if (follow && rows.length > 0) {
      virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
    }
  }, [rows.length, follow, virtualizer]);

  return (
    <div className="table-wrap">
      <div className="table-head">
        <span className="col-time">time</span>
        <span className="col-chip">channel</span>
        <span className="col-type">type</span>
        <span className="col-instance">instance</span>
        <span className="col-payload">payload</span>
        <label className="follow">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          follow
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
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]!;
            const env = row.env;
            const severity = severityForType(env.event.type);
            return (
              <div
                key={env.seq}
                className={[
                  "row",
                  env.seq === selectedSeq ? "selected" : "",
                  severity === "error" ? "error" : "",
                  severity === "warn" ? "warn" : ""
                ].join(" ")}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: item.size,
                  transform: `translateY(${item.start}px)`
                }}
                onClick={() =>
                  select(env.seq === selectedSeq ? null : env.seq)
                }
              >
                <span className="col-time">{formatTime(env.event.timestamp)}</span>
                <span className="col-chip">
                  <span className={channelClass(env.channel)}>
                    {channelShortName(env.channel)}
                  </span>
                </span>
                <span className="col-type">{env.event.type}</span>
                <span className="col-instance">{instanceKey(env.event)}</span>
                <span className="col-payload">
                  {payloadPreview(env.event.payload)}
                </span>
              </div>
            );
          })}
        </div>
        {rows.length === 0 && (
          <div className="empty">
            waiting for events… run your agent with{" "}
            <code>observability = devtools()</code> under wrangler dev
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPanel() {
  const selectedSeq = useStore((s) => s.selectedSeq);
  const select = useStore((s) => s.select);
  const rows = useStore((s) => s.rows);
  const row = useMemo(
    () => rows.find((r) => r.env.seq === selectedSeq),
    [rows, selectedSeq]
  );
  if (row === undefined) return null;
  return (
    <aside className="detail">
      <div className="detail-head">
        <span>
          #{row.env.seq} {row.env.event.type}
        </span>
        <button type="button" onClick={() => select(null)}>
          ×
        </button>
      </div>
      <pre>{JSON.stringify(row.env, null, 2)}</pre>
    </aside>
  );
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "stream", label: "Stream" },
  { id: "timeline", label: "Timeline" }
];

function TabBar() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  return (
    <div className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === activeTab ? "tab active" : "tab"}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function StreamTab() {
  const filtered = useFilteredRows();
  return (
    <div className="content">
      <FilterBar />
      <EventTable rows={filtered} />
    </div>
  );
}

export function App() {
  const activeTab = useStore((s) => s.activeTab);
  return (
    <div className="app">
      <Header />
      <TabBar />
      <main className="main">
        <Sidebar />
        {activeTab === "stream" ? (
          <StreamTab />
        ) : (
          <div className="content">
            <TimelineView />
          </div>
        )}
        <DetailPanel />
      </main>
    </div>
  );
}
