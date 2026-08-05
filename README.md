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

## License

[MIT](LICENSE).
