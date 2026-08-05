# agents-devtools

[![Language](https://img.shields.io/badge/README-Korean_Ver-blue?style=for-the-badge)](README_KR.md)
[![npm version](https://img.shields.io/npm/v/agents-devtools?style=for-the-badge)](https://www.npmjs.com/package/agents-devtools)
[![npm downloads](https://img.shields.io/npm/dm/agents-devtools?style=for-the-badge)](https://www.npmjs.com/package/agents-devtools)
[![License](https://img.shields.io/npm/l/agents-devtools?style=for-the-badge)](LICENSE)

Local DevTools for agents built with the [Cloudflare Agents SDK](https://github.com/cloudflare/agents) (`agents` npm package). Collects the structured observability events your agents emit during `wrangler dev` and visualizes them in a web UI.

It provides:

- a real-time event stream
- per-instance timelines
- chat recovery inspection
- a schedule board
- connection lifecycles
- session recording, export, and replay (NDJSON)

In short, it's a React DevTools / Chrome Network tab, but for Cloudflare Agents.

> [!IMPORTANT]
> This is an unofficial community tool that works with the Cloudflare Agents SDK. It is not affiliated with, endorsed by, or supported by Cloudflare. Event schemas are based on the observability events published by [`cloudflare/agents`](https://github.com/cloudflare/agents).

![Stream tab — the real-time event stream with channel filters and a payload inspector](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/stream.png)

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

### Compatibility

|                    | Requirement                                                                                                             |
|--------------------|-------------------------------------------------------------------------------------------------------------------------|
| `agents` (peer)    | `>=0.7.0 <1`                                                                                                            |
| Chat event support | requires [`@cloudflare/ai-chat`](https://www.npmjs.com/package/@cloudflare/ai-chat) (moved out of `agents` in SDK 0.20) |
| Node.js            | `>=20`                                                                                                                  |
| Local runtime      | `wrangler dev` (production Workers need a Tail Worker, not yet supported)                                               |
| Browser (UI)       | any current evergreen browser (Chrome, Firefox, Safari, Edge)                                                           |

Verified against `agents@0.20.1` and `@cloudflare/ai-chat@0.10.1`. The event schema is best-effort forward compatible — unknown event types render as raw JSON in the Stream tab instead of crashing the UI.

### Opt-in state snapshots

`state:update` events carry an empty payload by default — the SDK does not expose your agent's state to observability listeners. Pass `captureState` to attach a shallow, size-capped snapshot:

```ts
export class MyAgent extends Agent<Env, State> {
  override observability = devtools({ captureState: () => this.state });
}
```

`captureState` is only invoked for `state:update` events and never mutates the event forwarded to the original SDK behavior (`base`) — it only augments the copy sent to the collector. The snapshot is shallow (nested objects/arrays/maps/sets are summarized as `[object]` / `[array(n)]`, not recursed into), long strings are truncated, and the whole snapshot is dropped in favor of a `{ "[truncated]": true }` marker if it would exceed a few KB. This is off by default because agent state can contain sensitive data — only enable it for local debugging.

### Recording and replay

Pass `--record <file>` to the CLI to have the collector append every event to an NDJSON session file as it arrives:

```sh
$ npx agents-devtools --record ./session.ndjson
```

Independently, the UI itself can export whatever is currently in the buffer: the **Export** button in the header downloads the visible events as an `.ndjson` file — a session header line followed by one event envelope per line, the same format `--record` writes to disk.

To review a session later, drag an `.ndjson` file onto the UI. This pauses live ingestion and swaps the view to the recorded session (a banner shows the file name and lets you jump back). Click **Return to live** to resume — the UI backfills whatever arrived while you were looking at the recording, so nothing in between is lost.

Use **Pause** in the header to freeze the view without importing anything; **Resume** backfills the gap the same way. The dropped-event counter next to it reflects the collector's ring buffer, not the UI — it rises when events are evicted before the UI ever sees them (buffer overflow), independent of pause state.

## Screenshots

Events show up in the UI moments after your agent emits them:

![Live event stream filling up as the demo agent runs](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/live.gif)

**Timeline** — per-instance event rail with fiber run spans (green completed, red failed):

![Timeline tab](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/timeline.png)

**Chat** — recovery incidents grouped into collapsible chains (detected → attempt → scheduled → completed/failed):

![Chat tab](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/chat.png)

**Schedules** — a card board per schedule id, with duplicate-schedule warnings:

![Schedules tab](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/schedules.png)

**Connections** — WebSocket lifecycles with close codes and durations:

![Connections tab](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/connections.png)

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

### Publishing

Only `packages/collector` is published, as the `agents-devtools` npm package (CLI + bundled UI + `./client` and `./protocol` subpath exports). `protocol`, `client`, and `ui` stay private workspace packages, bundled in at build time.

```sh
$ pnpm build                              # builds ui/dist and collector/dist
$ cd packages/collector
$ npm pack --dry-run                      # inspect the tarball before publishing
$ pnpm publish --access public            # rewrites workspace:* deps automatically
```

`pnpm publish` runs the package's `prepack` script first, which copies the root `LICENSE` and `README.md` and the built `packages/ui/dist` into `packages/collector/` (as `ui-dist/`) so the published tarball is self-contained — these copies are gitignored and regenerated on every pack.

## License

[MIT](LICENSE).
