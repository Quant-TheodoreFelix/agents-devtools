# Contributing Guide

[![Language](https://img.shields.io/badge/CONTRIBUTING-Korean_Ver-blue?style=for-the-badge)](CONTRIBUTING_KR.md)

Thank you for your interest in agents-devtools. This document covers everything you need to contribute, from setting up a development environment to submitting a PR.

> [!IMPORTANT]
> This is an unofficial community tool that works with the Cloudflare Agents SDK. It is not affiliated with, endorsed by, or supported by Cloudflare.

## Development Setup

Node 20+ and pnpm are required.

```sh
$ git clone https://github.com/Quant-TheodoreFelix/agents-devtools.git
$ cd agents-devtools
$ pnpm install
$ pnpm build       # build the collector CLI and the UI
$ pnpm test        # run vitest across all packages
$ pnpm typecheck   # type-check all packages
```

## Repository Layout

This is a pnpm monorepo with clearly separated package roles.

| Path                  | Role                                                                        |
|-----------------------|-----------------------------------------------------------------------------|
| `packages/protocol`   | Event envelope / NDJSON session format / channel mapping (zero dependencies) |
| `packages/client`     | The `devtools()` factory you drop into an agent (targets the Workers runtime) |
| `packages/collector`  | Collector server + CLI **(the only package published to npm)**              |
| `packages/ui`         | React web UI (Vite + Zustand)                                               |
| `examples/demo-agent` | Demo agent for feature demos and verification (no API key required)         |

`protocol`, `client`, and `ui` are private workspace packages that get merged (bundled) into the collector at build time. Do not add them to the collector's `dependencies` — they are not runtime dependencies, and adding them can break installation for consumers.

## Verifying Changes

For changes that unit tests alone can't cover (the ingest path, UI behavior), verify end-to-end with the demo agent.

```sh
# terminal 1 - DevTools (collector :4111 + UI :4110)
$ node packages/collector/dist/cli.js

# terminal 2 - demo agent
$ cd examples/demo-agent && pnpm dev

# terminal 3 - trigger events
$ cd examples/demo-agent
$ pnpm exercise                # basic events (rpc, state, schedule, connect)
$ pnpm exercise:scenarios s1   # chat stream stall -> recovery chain
$ pnpm exercise:scenarios s2   # schedule duplicate warning
$ pnpm exercise:scenarios s4   # MCP connection failure
$ pnpm exercise:fiber          # synthetic fiber spans for the timeline
```

If you test the publish artifact locally with `npm pack`, make sure to delete the `ui-dist/`, `LICENSE`, and `README.md` generated inside `packages/collector/`. If left behind, the collector serves those copies instead of the latest UI build, making it look like your changes during development aren't being applied.

## Design Constraints

PRs that do not respect the following cannot be merged.

1. **The client never affects the agent.**
   - It never throws outward, never mutates events passed to the SDK's default emission (`base`), and when no collector is running it fails silently and eventually disables itself.
2. **The collector is isolated by default.**
   - It binds to `127.0.0.1` by default, sends no data anywhere, and must validate every input it receives so malformed input can be rejected.
3. **NDJSON session format v1 is a stable contract.**
   - Changing the meaning or type of existing fields (breaking changes) is forbidden. Extensions are allowed only in a backward-compatible way (new optional fields).
4. **Unknown events are accepted.**
   - When the SDK adds new event types, the UI must render them raw without crashing.

## Code Conventions

- TypeScript strict mode applies; `pnpm typecheck` must pass.
- Add vitest tests alongside new features and bug fixes. Keeping pure logic (domain builders, format parsing) in testable modules separate from UI components is the pattern in this repository.
- Write comments only sparingly, to explain constraints that the code itself cannot express.

> [!TIP]
> You are free to use AI agents. In that case, add a `Co-authored-by` trailer **that includes the model name**.

### UI Strings and Internationalization

Every user-visible string in the UI goes through `packages/ui/src/i18n/` instead of being hardcoded.

- `en.ts` is the source of truth for message keys. New strings must be added there first.
- `ko.ts` is typed `Record<keyof typeof en, string>`, so a missing key is a type error.
- Adding a new language is just writing one dictionary file and registering it in `DICTIONARIES` and `LOCALE_LABELS` in `i18n/index.ts`.

## Commits and PRs

- `pnpm test` and `pnpm typecheck` must fully pass before opening a PR.
- If user-visible behavior changes, describe it in detail in the PR body, and when possible update `README.md` and `README_KR.md` together.

## Bug Reports

Please file them on [GitHub Issues](https://github.com/Quant-TheodoreFelix/agents-devtools/issues). Attaching a session file that captures the reproduction is ideal. The **Export** button in the UI header saves the events from the moment of the problem as an `.ndjson` file, and whoever receives it can drag the file into their UI to replay it as-is. **Before attaching, make sure the payloads contain no sensitive data.**

For security vulnerabilities, rather than putting a full reproduction in a public issue, briefly describe the impact and coordinate the details privately via email at <qtfelix@qu4nt.space>.
