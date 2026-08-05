import { instanceKey, RAW_CHANNELS } from "@agents-devtools/protocol";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType
} from "react";
import {
  channelClass,
  channelShortName,
  formatTime,
  payloadPreview
} from "./format";
import { ChatView } from "./ChatView";
import { requestResync } from "./connection";
import { ConnectionsView } from "./ConnectionsView";
import {
  isLocaleId,
  LOCALE_IDS,
  LOCALE_LABELS,
  type MessageKey
} from "./i18n";
import { useT } from "./i18n/useT";
import { SchedulesView } from "./SchedulesView";
import { buildSessionText, parseSessionText } from "./session";
import { Sidebar } from "./Sidebar";
import { useStore, type Row, type Tab } from "./store";
import { severityForType } from "./timeline";
import { TimelineView } from "./TimelineView";

function StatusDot() {
  const status = useStore((s) => s.status);
  const t = useT();
  const label = t(`status.${status}`);
  return (
    <span className={`status status-${status}`} title={label}>
      ● {label}
    </span>
  );
}

function LanguageSelect() {
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);
  const t = useT();
  return (
    <select
      className="lang-select"
      aria-label={t("header.language")}
      value={locale}
      onChange={(e) => {
        const next = e.target.value;
        if (isLocaleId(next)) setLocale(next);
      }}
    >
      {LOCALE_IDS.map((id) => (
        <option key={id} value={id}>
          {LOCALE_LABELS[id]}
        </option>
      ))}
    </select>
  );
}

function ExportButton() {
  const rows = useStore((s) => s.rows);
  const t = useT();
  const handleExport = () => {
    const now = Date.now();
    const text = buildSessionText(rows, now);
    const blob = new Blob([text], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agents-devtools-session-${now}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={handleExport}>
      {t("header.export")}
    </button>
  );
}

function PauseButton() {
  const paused = useStore((s) => s.paused);
  const setPaused = useStore((s) => s.setPaused);
  const session = useStore((s) => s.session);
  const t = useT();
  return (
    <button
      type="button"
      disabled={session.kind === "replay"}
      onClick={() => {
        const next = !paused;
        setPaused(next);
        if (!next) void requestResync();
      }}
    >
      {paused ? t("header.resume") : t("header.pause")}
    </button>
  );
}

function Header() {
  const dropped = useStore((s) => s.dropped);
  const total = useStore((s) => s.rows.length);
  const clear = useStore((s) => s.clear);
  const t = useT();
  return (
    <header className="header">
      <h1>agents-devtools</h1>
      <StatusDot />
      <span className="meta">
        {t("header.events", { count: total.toLocaleString() })}
      </span>
      {dropped > 0 && (
        <span className="meta warn">
          {t("header.dropped", { count: dropped.toLocaleString() })}
        </span>
      )}
      <span className="spacer" />
      <LanguageSelect />
      <PauseButton />
      <ExportButton />
      <button type="button" onClick={clear}>
        {t("header.clear")}
      </button>
    </header>
  );
}

function ReplayBanner() {
  const session = useStore((s) => s.session);
  const exitReplay = useStore((s) => s.exitReplay);
  const t = useT();
  if (session.kind !== "replay") return null;
  return (
    <div className="replay-banner">
      <span>{t("replay.viewing", { fileName: session.fileName })}</span>
      {session.header !== null && (
        <span className="card-meta">
          {formatTime(session.header.createdAt)}
        </span>
      )}
      {session.parseErrors > 0 && (
        <span className="card-meta warn">
          {t("replay.errors", { count: session.parseErrors })}
        </span>
      )}
      <span className="spacer" />
      <button
        type="button"
        onClick={() => {
          exitReplay();
          void requestResync();
        }}
      >
        {t("replay.returnToLive")}
      </button>
    </div>
  );
}

function useSessionDrop(): boolean {
  const loadReplay = useStore((s) => s.loadReplay);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer !== null && e.dataTransfer.types.includes("Files");

    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file === undefined) return;
      void file.text().then((text) => {
        const { header, envelopes, errors } = parseSessionText(text);
        loadReplay(file.name, header, envelopes, errors);
      });
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [loadReplay]);

  return dragging;
}

function FilterBar() {
  const channelFilter = useStore((s) => s.channelFilter);
  const toggleChannel = useStore((s) => s.toggleChannel);
  const clearChannelFilter = useStore((s) => s.clearChannelFilter);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const t = useT();
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
        {t("filter.all")}
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
        placeholder={t("filter.searchPlaceholder")}
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
  const t = useT();
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
        <span className="col-time">{t("table.time")}</span>
        <span className="col-chip">{t("table.channel")}</span>
        <span className="col-type">{t("table.type")}</span>
        <span className="col-instance">{t("table.instance")}</span>
        <span className="col-payload">{t("table.payload")}</span>
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
            {t("stream.empty").split("{code}")[0] ?? ""}
            <code>observability = devtools()</code>
            {t("stream.empty").split("{code}")[1] ?? ""}
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

const TABS: Array<{ id: Tab; labelKey: MessageKey }> = [
  { id: "stream", labelKey: "tab.stream" },
  { id: "timeline", labelKey: "tab.timeline" },
  { id: "chat", labelKey: "tab.chat" },
  { id: "schedules", labelKey: "tab.schedules" },
  { id: "connections", labelKey: "tab.connections" }
];

function TabBar() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const t = useT();
  return (
    <div className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === activeTab ? "tab active" : "tab"}
          onClick={() => setActiveTab(tab.id)}
        >
          {t(tab.labelKey)}
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

const TAB_VIEWS: Record<Exclude<Tab, "stream">, ComponentType> = {
  timeline: TimelineView,
  chat: ChatView,
  schedules: SchedulesView,
  connections: ConnectionsView
};

export function App() {
  const activeTab = useStore((s) => s.activeTab);
  const locale = useStore((s) => s.locale);
  const t = useT();
  const dragging = useSessionDrop();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const TabView = activeTab === "stream" ? null : TAB_VIEWS[activeTab];
  return (
    <div className="app">
      <Header />
      <ReplayBanner />
      <TabBar />
      <main className="main">
        <Sidebar />
        {TabView === null ? (
          <StreamTab />
        ) : (
          <div className="content">
            <TabView />
          </div>
        )}
        <DetailPanel />
      </main>
      {dragging && (
        <div className="drop-overlay">{t("replay.dropHint")}</div>
      )}
    </div>
  );
}
