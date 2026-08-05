import {
  DEFAULT_INGEST_PATH,
  DEFAULT_INGEST_PORT,
  channelForType,
  type IngestBatch
} from "@agents-devtools/protocol";
import type { Observability, ObservabilityEvent } from "agents/observability";
import { genericObservability } from "agents/observability";
import { shallowSnapshot } from "./snapshot";

export type DevtoolsOptions = {
  endpoint?: string;
  enabled?: boolean;
  base?: Observability | null;
  flushIntervalMs?: number;
  maxBatch?: number;
  maxQueue?: number;
  maxFailures?: number;
  // 옵트인 상태 스냅샷 - this.state를 읽어 반환하는 함수를 전달하면
  // state:update 이벤트에만 얕은 스냅샷을 동봉해 전송한다(원본 SDK 이벤트는 변형하지 않음)
  captureState?: () => unknown;
};

export const DEFAULT_ENDPOINT = `http://127.0.0.1:${DEFAULT_INGEST_PORT}${DEFAULT_INGEST_PATH}`;

export function devtools(options: DevtoolsOptions = {}): Observability {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const base =
    options.base === undefined ? genericObservability : options.base;
  const flushIntervalMs = options.flushIntervalMs ?? 250;
  const maxBatch = options.maxBatch ?? 50;
  const maxQueue = options.maxQueue ?? 1000;
  const maxFailures = options.maxFailures ?? 5;

  let queue: IngestBatch["events"] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let mutedUntil = 0;
  let dead = options.enabled === false;

  const onFailure = () => {
    failures += 1;
    if (failures >= maxFailures) {
      dead = true;
      queue = [];
      return;
    }
    mutedUntil = Date.now() + Math.min(30_000, 1000 * 2 ** failures);
  };

  const flush = () => {
    timer = null;
    if (dead || queue.length === 0) return;
    const events = queue;
    queue = [];
    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ v: 1, events } satisfies IngestBatch)
      }).then((res) => {
        if (res.ok) {
          failures = 0;
          mutedUntil = 0;
        } else {
          onFailure();
        }
      }, onFailure);
    } catch {
      onFailure();
    }
  };

  const enqueue = (event: ObservabilityEvent) => {
    if (dead || Date.now() < mutedUntil) return;
    queue.push({ channel: channelForType(event.type), event });
    if (queue.length > maxQueue) {
      queue.splice(0, queue.length - maxQueue);
    }
    if (queue.length >= maxBatch) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
      return;
    }
    if (timer === null) {
      timer = setTimeout(flush, flushIntervalMs);
    }
  };

  const captureState = options.captureState;
  const withSnapshot = (event: ObservabilityEvent): ObservabilityEvent => {
    if (event.type !== "state:update" || captureState === undefined) {
      return event;
    }
    try {
      return {
        ...event,
        payload: { ...event.payload, snapshot: shallowSnapshot(captureState()) }
      } as unknown as ObservabilityEvent;
    } catch {
      return event;
    }
  };

  return {
    emit(event) {
      base?.emit(event);
      try {
        enqueue(withSnapshot(event));
      } catch {}
    }
  };
}
