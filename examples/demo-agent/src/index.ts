import { Agent, callable, routeAgentRequest } from "agents";
import { devtools } from "agents-devtools/client";

type Env = {
  DemoAgent: DurableObjectNamespace;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("not found", { status: 404 })
    );
  }
};
