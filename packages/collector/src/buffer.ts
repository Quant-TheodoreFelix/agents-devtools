import type {
  EventEnvelope,
  ObservabilityEventLike
} from "@agents-devtools/protocol";

export class EventBuffer {
  private entries: EventEnvelope[] = [];
  private head = 0;
  private nextSeq = 1;
  private droppedCount = 0;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`invalid buffer capacity: ${capacity}`);
    }
  }

  ingest(
    items: ReadonlyArray<{ channel: string; event: ObservabilityEventLike }>,
    receivedAt: number
  ): EventEnvelope[] {
    const out: EventEnvelope[] = [];
    for (const item of items) {
      const envelope: EventEnvelope = {
        v: 1,
        seq: this.nextSeq++,
        receivedAt,
        channel: item.channel,
        event: item.event
      };
      if (this.entries.length < this.capacity) {
        this.entries.push(envelope);
      } else {
        this.entries[this.head] = envelope;
        this.head = (this.head + 1) % this.capacity;
        this.droppedCount += 1;
      }
      out.push(envelope);
    }
    return out;
  }

  ordered(): EventEnvelope[] {
    return [...this.entries.slice(this.head), ...this.entries.slice(0, this.head)];
  }

  since(seq: number): EventEnvelope[] {
    return this.ordered().filter((e) => e.seq > seq);
  }

  clear(): void {
    this.entries = [];
    this.head = 0;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  get total(): number {
    return this.nextSeq - 1;
  }

  get size(): number {
    return this.entries.length;
  }
}
