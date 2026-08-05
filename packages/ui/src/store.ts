import type { EventEnvelope, SessionHeader } from "@agents-devtools/protocol";
import { create } from "zustand";
import { loadInitialLocale, persistLocale, type LocaleId } from "./i18n";

export type Row = {
  env: EventEnvelope;
  text: string;
};

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type Tab = "stream" | "timeline" | "chat" | "schedules" | "connections";

export type Session =
  | { kind: "live" }
  | {
      kind: "replay";
      fileName: string;
      header: SessionHeader | null;
      savedRows: Row[];
      savedLastSeq: number;
      parseErrors: number;
    };

type StreamState = {
  rows: Row[];
  lastSeq: number;
  dropped: number;
  status: ConnectionStatus;
  selectedSeq: number | null;
  channelFilter: string[];
  search: string;
  activeTab: Tab;
  selectedInstance: string | null;
  locale: LocaleId;
  paused: boolean;
  session: Session;
  addEnvelopes: (list: EventEnvelope[]) => void;
  setDropped: (n: number) => void;
  setStatus: (status: ConnectionStatus) => void;
  select: (seq: number | null) => void;
  toggleChannel: (channel: string) => void;
  clearChannelFilter: () => void;
  setSearch: (search: string) => void;
  setActiveTab: (tab: Tab) => void;
  selectInstance: (key: string | null) => void;
  setLocale: (locale: LocaleId) => void;
  setPaused: (paused: boolean) => void;
  loadReplay: (
    fileName: string,
    header: SessionHeader | null,
    envelopes: EventEnvelope[],
    parseErrors: number
  ) => void;
  exitReplay: () => void;
  clear: () => void;
};

const MAX_ROWS = 50_000;

function toRow(env: EventEnvelope): Row {
  const e = env.event;
  return {
    env,
    text: `${e.type} ${e.agent ?? ""} ${e.name ?? ""} ${JSON.stringify(
      e.payload
    )}`.toLowerCase()
  };
}

export const useStore = create<StreamState>((set) => ({
  rows: [],
  lastSeq: 0,
  dropped: 0,
  status: "connecting",
  selectedSeq: null,
  channelFilter: [],
  search: "",
  activeTab: "stream",
  selectedInstance: null,
  locale: loadInitialLocale(),
  paused: false,
  session: { kind: "live" },
  addEnvelopes: (list) =>
    set((state) => {
      if (state.paused) return state;
      const fresh = list.filter((e) => e.seq > state.lastSeq);
      if (fresh.length === 0) return state;
      let rows = [...state.rows, ...fresh.map(toRow)];
      if (rows.length > MAX_ROWS) rows = rows.slice(rows.length - MAX_ROWS);
      return { rows, lastSeq: fresh[fresh.length - 1]!.seq };
    }),
  setDropped: (dropped) => set({ dropped }),
  setStatus: (status) => set({ status }),
  select: (selectedSeq) => set({ selectedSeq }),
  toggleChannel: (channel) =>
    set((state) => ({
      channelFilter: state.channelFilter.includes(channel)
        ? state.channelFilter.filter((c) => c !== channel)
        : [...state.channelFilter, channel]
    })),
  clearChannelFilter: () => set({ channelFilter: [] }),
  setSearch: (search) => set({ search }),
  setActiveTab: (activeTab) => set({ activeTab }),
  selectInstance: (selectedInstance) =>
    set((state) => ({
      selectedInstance,
      activeTab: state.activeTab === "stream" ? "timeline" : state.activeTab
    })),
  setLocale: (locale) => {
    persistLocale(locale);
    set({ locale });
  },
  setPaused: (paused) => set({ paused }),
  loadReplay: (fileName, header, envelopes, parseErrors) =>
    set((state) => {
      const rows = envelopes.map(toRow);
      const lastSeq = rows[rows.length - 1]?.env.seq ?? 0;
      return {
        rows,
        lastSeq,
        selectedSeq: null,
        dropped: 0,
        paused: true,
        session: {
          kind: "replay",
          fileName,
          header,
          parseErrors,
          savedRows: state.session.kind === "live" ? state.rows : state.session.savedRows,
          savedLastSeq:
            state.session.kind === "live"
              ? state.lastSeq
              : state.session.savedLastSeq
        }
      };
    }),
  exitReplay: () =>
    set((state) => {
      if (state.session.kind !== "replay") return state;
      return {
        rows: state.session.savedRows,
        lastSeq: state.session.savedLastSeq,
        selectedSeq: null,
        paused: false,
        session: { kind: "live" }
      };
    }),
  clear: () => set({ rows: [], selectedSeq: null })
}));
