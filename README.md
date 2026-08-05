# agents-devtools

[![Language](https://img.shields.io/badge/README-Korean_Ver-blue?style=for-the-badge)](README_KR.md)

Local DevTools for agents built with the [Cloudflare Agents SDK](https://github.com/cloudflare/agents) (`agents` npm package). Collects the structured observability events your agents emit during `wrangler dev` and visualizes them in a web UI.

It provides:

- a real-time event stream
- per-instance timelines
- chat recovery inspection
- a schedule board
- connection lifecycles

In short, it's a React DevTools / Chrome Network tab, but for Cloudflare Agents.

> [!IMPORTANT]
> This is an unofficial community tool that works with the Cloudflare Agents SDK. It is not affiliated with, endorsed by, or supported by Cloudflare. Event schemas are based on the observability events published by [`cloudflare/agents`](https://github.com/cloudflare/agents).

## Quick start

First, add the following code to your agent.

```ts
import { devtools } from "agents-devtools/client";

export class MyAgent extends Agent<Env, State> {
  override observability = devtools();
}
```

Then run DevTools alongside `wrangler dev`.

```sh
$ npx agents-devtools
```

The collector listens on `127.0.0.1:4111` and the UI runs at `http://127.0.0.1:4110`.

`devtools()` preserves the SDK's default `diagnostics_channel` emission and is fail-safe: if the collector is not running, your agent is unaffected (events are silently dropped and the client disables itself after repeated failures). Event delivery is best-effort by design — this is observability tooling, not an audit log.

### Opt-in state snapshots

`state:update` events carry an empty payload by default — the SDK does not expose your agent's state to observability listeners. Pass `captureState` to attach a shallow, size-capped snapshot:

```ts
export class MyAgent extends Agent<Env, State> {
  override observability = devtools({ captureState: () => this.state });
}
```

`captureState` is only invoked for `state:update` events and never mutates the event forwarded to the original SDK behavior (`base`) — it only augments the copy sent to the collector. The snapshot is shallow (nested objects/arrays/maps/sets are summarized as `[object]` / `[array(n)]`, not recursed into), long strings are truncated, and the whole snapshot is dropped in favor of a `{ "[truncated]": true }` marker if it would exceed a few KB. This is off by default because agent state can contain sensitive data — only enable it for local debugging.

## Development

It's a pnpm monorepo and requires Node 20 or later.

```sh
$ pnpm install
$ pnpm build   # builds the collector CLI and the UI
$ pnpm test    # vitest across protocol / client / collector
```

For an end-to-end check with the bundled demo agent, run:

```sh
# terminal 1 - the DevTools (collector :4111 + UI :4110)
$ node packages/collector/dist/cli.js

# terminal 2 - the demo agent
$ cd examples/demo-agent && pnpm dev

# terminal 3 - generate events (rpc, rpc:error, state, schedule, connect/disconnect)
$ cd examples/demo-agent && pnpm exercise
```

Events appear in the UI almost immediately. Killing the DevTools process must not affect the demo agent — that's a design guarantee, verified by running the exercise script both with and without the collector.

### Reproducing the debugging scenarios

The demo includes a chat agent (`DemoChatAgent`) with a mock streaming model — no API key required. It exposes a test hook that force-stalls the model stream, which drives the SDK's stall watchdog (`chatStreamStallTimeoutMs: 2000`) and bounded recovery (`chatRecovery: { maxAttempts: 3, noProgressTimeoutMs: 15000 }`).

With the collector and `wrangler dev` running (terminals 1 and 2 above):

```sh
$ cd examples/demo-agent
$ pnpm exercise:scenarios s1   # stalled stream -> recovery chain (~40s)
$ pnpm exercise:scenarios s2   # 12 stale one-shots -> schedule:duplicate_warning
$ pnpm exercise:scenarios s4   # unreachable MCP server -> mcp:client:connect error
```

- **S1 (stalled chat stream)** — the script first stalls one turn, producing a recovery chain that heals (`chat:recovery:detected` -> `attempt` -> `scheduled` -> `completed`), then stalls every turn so the retried recovery run dies too (`chat:recovery:failed`). Open the **Chat** tab: each incident is a collapsible chain with attempt progress and terminal status. Each chat turn also emits real `fiber:run:*` spans, visible on the **Timeline** tab. (`@cloudflare/ai-chat` 0.10.1 routes a watchdog stall directly into recovery without emitting a separate `chat:stream:stalled` event; the UI still renders that event into the chain when present.)
- **S2 (duplicate schedules)** — 12 one-shot schedules with the same callback land in a single alarm cycle, which the SDK flags with `schedule:duplicate_warning`. Open the **Schedules** tab: the warning banner shows the callback and count above the per-id cards.
- **S4 (MCP connection failure)** — connecting to `http://127.0.0.1:9/mcp` fails version negotiation. Filter the **Stream** tab by the `mcp` channel: each `mcp:client:connect` event carries `url`, `transport`, `state: "failed"`, and `error`.

`pnpm exercise:fiber` additionally injects synthetic fiber span events for the Timeline tab.

## License

[MIT](LICENSE).
