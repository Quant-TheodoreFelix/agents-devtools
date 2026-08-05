import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import { devtools } from "agents-devtools/client";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

type Env = {
  DemoAgent: DurableObjectNamespace;
  DemoChatAgent: DurableObjectNamespace;
};

type State = {
  counter: number;
  lastGreeting: string | null;
};

export class DemoAgent extends Agent<Env, State> {
  initialState: State = { counter: 0, lastGreeting: null };

  override observability = devtools();

  @callable()
  greet(name: string): string {
    const counter = this.state.counter + 1;
    this.setState({ counter, lastGreeting: name });
    return `hello ${name} (#${counter})`;
  }

  @callable()
  fail(): never {
    throw new Error("intentional failure for rpc:error");
  }

  @callable()
  async scheduleTick(delaySeconds: number): Promise<string> {
    const schedule = await this.schedule(delaySeconds, "tick", {
      requestedAt: Date.now()
    });
    return schedule.id;
  }

  async tick(payload: { requestedAt: number }): Promise<void> {
    this.setState({
      counter: this.state.counter + 1,
      lastGreeting: this.state.lastGreeting
    });
    console.log(
      `tick executed, scheduled ${Date.now() - payload.requestedAt}ms ago`
    );
  }

  async onRequest(_request: Request): Promise<Response> {
    return Response.json({ ok: true, state: this.state });
  }
}

type StallMode = "none" | "once" | "always";

type ChatState = {
  stall: StallMode;
};

export class DemoChatAgent extends AIChatAgent<Env, ChatState> {
  initialState: ChatState = { stall: "none" };

  override observability = devtools();

  chatRecovery = { maxAttempts: 3, noProgressTimeoutMs: 15_000 };

  chatStreamStallTimeoutMs = 2_000;

  @callable()
  setStall(mode: StallMode): StallMode {
    this.setState({ stall: mode });
    return mode;
  }

  @callable()
  async say(text: string): Promise<{ requestId: string; status: string }> {
    const result = await this.saveMessages((messages) => [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user" as const,
        parts: [{ type: "text" as const, text }]
      }
    ]);
    return { requestId: result.requestId, status: result.status };
  }

  @callable()
  async scheduleBurst(count: number): Promise<number> {
    for (let i = 0; i < count; i += 1) {
      await this.schedule(1, "burst", { i });
    }
    return count;
  }

  async burst(_payload: { i: number }): Promise<void> {}

  @callable()
  async connectBrokenMcp(): Promise<string> {
    try {
      await this.addMcpServer("broken", "http://127.0.0.1:9/mcp");
      return "connected";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  override async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions
  ): Promise<Response> {
    const stall = this.state.stall;
    if (stall === "once") this.setState({ stall: "none" });
    const shouldStall = stall !== "none";
    const abortSignal = options?.abortSignal;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = crypto.randomUUID();
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: "mock: " });
        if (shouldStall) {
          await new Promise<void>((resolve) => {
            abortSignal?.addEventListener("abort", () => resolve(), {
              once: true
            });
          });
          return;
        }
        writer.write({ type: "text-delta", id, delta: "the answer is 42" });
        writer.write({ type: "text-end", id });
        writer.write({ type: "finish" });
      }
    });
    return createUIMessageStreamResponse({ stream });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("not found", { status: 404 })
    );
  }
};
