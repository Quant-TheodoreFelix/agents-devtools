import { createWriteStream, type WriteStream } from "node:fs";
import {
  makeSessionHeader,
  serializeRecord,
  type EventEnvelope
} from "@agents-devtools/protocol";

export class Recorder {
  private stream: WriteStream | null = null;

  constructor(
    private readonly filePath: string,
    private readonly tool: string
  ) {}

  private ensureStream(): WriteStream {
    if (this.stream === null) {
      this.stream = createWriteStream(this.filePath, { flags: "a" });
      const header = makeSessionHeader({
        createdAt: Date.now(),
        tool: this.tool
      });
      this.stream.write(`${serializeRecord(header)}\n`);
    }
    return this.stream;
  }

  append(envelopes: readonly EventEnvelope[]): void {
    if (envelopes.length === 0) return;
    const stream = this.ensureStream();
    let chunk = "";
    for (const envelope of envelopes) {
      chunk += `${serializeRecord(envelope)}\n`;
    }
    stream.write(chunk);
  }

  close(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (stream === null) return Promise.resolve();
    return new Promise((resolve) => stream.end(() => resolve()));
  }
}
