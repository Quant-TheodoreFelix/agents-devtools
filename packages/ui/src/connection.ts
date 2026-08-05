import type { EventEnvelope, ServerMessage } from "@agents-devtools/protocol";
import { DEFAULT_INGEST_PORT } from "@agents-devtools/protocol";
import { useStore } from "./store";

type UiConfig = {
  ingestHost: string;
  ingestPort: number;
};

async function loadConfig(): Promise<UiConfig> {
  try {
    const res = await fetch("/config.json");
    if (res.ok) {
      const config = (await res.json()) as Partial<UiConfig>;
      if (
        typeof config.ingestHost === "string" &&
        typeof config.ingestPort === "number"
      ) {
        return { ingestHost: config.ingestHost, ingestPort: config.ingestPort };
      }
    }
  } catch {}
  return { ingestHost: "127.0.0.1", ingestPort: DEFAULT_INGEST_PORT };
}

export function startConnection(): void {
  void run();
}

async function run(): Promise<void> {
  const config = await loadConfig();
  const httpBase = `http://${config.ingestHost}:${config.ingestPort}`;
  const wsUrl = `ws://${config.ingestHost}:${config.ingestPort}/ws`;

  const connect = () => {
    useStore.getState().setStatus("connecting");
    const ws = new WebSocket(wsUrl);
    let backfilled = false;
    let retried = false;
    const pending: EventEnvelope[] = [];

    const retry = () => {
      if (retried) return;
      retried = true;
      useStore.getState().setStatus("disconnected");
      setTimeout(connect, 2000);
    };

    const backfill = async () => {
      try {
        const since = useStore.getState().lastSeq;
        const res = await fetch(`${httpBase}/events?since=${since}`);
        if (res.ok) {
          const data = (await res.json()) as {
            envelopes: EventEnvelope[];
            dropped: number;
          };
          useStore.getState().addEnvelopes(data.envelopes);
          useStore.getState().setDropped(data.dropped);
        }
      } catch {}
      backfilled = true;
      useStore.getState().addEnvelopes(pending.splice(0));
    };

    ws.onmessage = (message) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(String(message.data)) as ServerMessage;
      } catch {
        return;
      }
      if (parsed.kind === "hello") {
        useStore.getState().setStatus("connected");
        useStore.getState().setDropped(parsed.dropped);
        void backfill();
      } else if (parsed.kind === "events") {
        useStore.getState().setDropped(parsed.dropped);
        if (backfilled) {
          useStore.getState().addEnvelopes(parsed.envelopes);
        } else {
          pending.push(...parsed.envelopes);
        }
      }
    };
    ws.onclose = retry;
    ws.onerror = () => ws.close();
  };

  connect();
}
