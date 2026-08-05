# Introducing agents-devtools

[![Language](https://img.shields.io/badge/INTRODUCTION-Korean_Ver-blue?style=for-the-badge)](INTRODUCTION_KR.md)

This document is a guide for anyone new to the agents-devtools project. Unlike [README.md](README.md), which focuses on installation and run commands, this document explains why this tool exists and how it works internally.

## One-line summary

**agents-devtools is a local development tool (devtools) that shows you, in real time, what's going on inside an agent built with the Cloudflare Agents SDK.**

When you do web development and open the Network tab in your browser's developer tools (F12), you can see every request going on behind the screen. This project brings that same experience to agent development. You can watch, from a single browser screen, which functions your agent received calls for, when its state changed, and whether a scheduled task succeeded or failed.

## Background

### What is the Cloudflare Agents SDK

The [Cloudflare Agents SDK](https://github.com/cloudflare/agents) (the `agents` npm package) is a framework for building "stateful agents" that run on Cloudflare Workers. Unlike an ordinary server function, an agent does things like:

- keeps remembering and updating its own state
- maintains a live WebSocket connection with clients
- schedules work for later, like "run this function in 10 minutes"
- talks to an LLM and relays streaming responses
- connects to external tool servers (MCP)

**The problem is that all of this happens quietly inside the server.** Sprinkling `console.log` calls everywhere and eyeballing terminal output was practically the only way to observe it.

### What are observability events

Fortunately, the SDK emits a structured signal every time something important happens internally. These are called **observability events**. Some examples:

| Event type | When it fires |
|---|---|
| `rpc` / `rpc:error` | when a method on the agent is called, or that call fails |
| `state:update` | when the agent's state changes |
| `connect` / `disconnect` | when a client attaches or detaches over WebSocket |
| `schedule:create` / `schedule:execute` / `schedule:error` | when a scheduled task is created, runs, or fails |
| `chat:recovery:*` | when a chat stream stalls and the SDK attempts automatic recovery |
| `mcp:client:connect` | when a connection attempt is made to an external MCP server |

The events are emitted, but the SDK doesn't ship a tool to "show" them. This project was built to fill that gap.

> [!IMPORTANT]
> `agents-devtools` is an unofficial community tool. It is not affiliated with or supported by Cloudflare.

## The overall architecture: three pieces

This project has three parts that pass events along like a relay.

```
client inside your agent -> (HTTP batch send) -> collector -> (WebSocket push) -> browser UI
```

### 1. Client: a bit of code added to your agent

In most cases your agent code is written in TypeScript. Add the following to it:

```ts
import { devtools } from "agents-devtools/client";

export class MyAgent extends Agent<Env, State> {
  override observability = devtools();
}
```

`devtools()` doesn't intercept the events the SDK emits, it **copies** them. The original emission behavior is left untouched, and the copies are batched up and sent to the local collector every 250ms (or once 50 have accumulated).

This is where the core design principle comes in. **The client must never affect the agent.** If the collector isn't running, the send fails silently, and after repeated failures the client disables itself. It never throws an exception, never slows the agent down, and never changes its behavior, because the agent has to behave identically whether DevTools is turned on or off.

### 2. Collector: the local server that gathers events

A small Node server you run with `npx agents-devtools`. It opens two ports:

- `127.0.0.1:4111`, the ingest port where the client sends events
- `127.0.0.1:4110`, the UI you open in your browser

Every event it receives gets a sequence number (seq) attached and is stored in a **ring buffer** (50,000 entries by default). A ring buffer is a circular store that, once full, evicts the oldest entry first. The number evicted is tallied as a drop count and shown in the UI, so if something was lost, you're told it was lost.

Security here defaults to isolation. The collector only binds to `127.0.0.1` (your own machine), so it can't be reached from an external network, sends nothing out, and validates the shape of every payload it receives, rejecting anything malformed.

### 3. UI: the screen you view in your browser

A web screen built with React. It connects to the collector over WebSocket, so new events appear the moment they arrive, and it also fetches anything that arrived before the connection was made, using sequence numbers to backfill. It currently supports the following languages, switchable from the header:

- Korean (ko)
- English (en)

## Tour of the screen: five tabs

The same event stream is presented from five different angles.

**Stream**, the default view, shows every event in arrival order. Filter by type with channel chips, search by text, and click a row to expand its full payload as JSON. This is the rawest place to see exactly what happened.

**Timeline** lets you pick an agent instance from the left sidebar and shows that instance's units of execution (fiber spans) as bars along a time axis, so you can see at a glance when something happened and how long it took.

**Chat** shows the list of turns for a chat agent along with **recovery incidents**. When LLM streaming stalls partway through, the SDK automatically retries, and the whole detect, attempt, schedule, succeed or fail sequence is grouped and shown as a single incident chain. For privacy, the conversation content itself is not shown, only metadata.

**Schedules** is a board of scheduled tasks as cards grouped by state (pending, executed, retrying, failed, cancelled). If schedules for the same callback pile up at once, the duplicate warning the SDK emits is shown as a banner too.

**Connections** shows the lifespan of WebSocket connections: which connection attached when, how long it stayed alive, and what code it closed with, shown together with a duration bar.

## Features for working across time

Sometimes you want to freeze a stream of events flowing by in real time.

- **Pause / Resume** freezes the view so you can inspect the current state without importing anything. Resuming backfills whatever was missed while paused, so nothing disappears.
- **Export** downloads everything currently visible as a single `.ndjson` file.
- **Replay** lets you drag an exported (or `--record`ed) `.ndjson` file onto the screen to view that session again. Clicking "Return to live" restores the original live view exactly as it was.

This flow lets you save "the moment the bug happened" to a file and reproduce it later, or on someone else's machine.

## Common terms

| Term | Meaning |
|---|---|
| NDJSON | a file format that stacks one JSON value per line. The first line is session info, every line after that is one event. You can open it in a plain text editor |
| Envelope | the wrapper the collector adds around an event, carrying its sequence number, receipt time, and channel. The UI and files always work in units of envelopes |
| Channel | the broad category of an event. The SDK defines 13, like `agents:rpc` and `agents:schedule` |
| Instance | a combination of the agent class name and its individual name. Same class, different name means a different instance |
| Fiber span | the span from when one unit of execution starts inside an agent to when it ends |
| Ring buffer | a storage scheme that evicts the oldest entry once it's full. This is how the collector stores events |
| Recovery incident | the whole automatic recovery process the SDK runs for one stalled chat stream, grouped into a single unit |

## Project structure

A pnpm monorepo split into packages by role.

```
packages/protocol    envelope and NDJSON format definitions (zero dependencies, shared by everything else)
packages/client      the devtools() you embed in your agent (targets the Workers runtime)
packages/collector    the collection server and CLI (the only package published to npm)
packages/ui           the React web screen
examples/demo-agent  a demo agent for trying out the features (no API key required)
```

Only `agents-devtools` is published to npm. Everything else is merged into it at build time.

## Try it yourself

A demo agent is included, so you can try every feature without an API key.

```sh
$ pnpm install && pnpm build

# terminal 1 - DevTools
$ node packages/collector/dist/cli.js

# terminal 2 - the demo agent
$ cd examples/demo-agent && pnpm dev

# terminal 3 - generate events
$ cd examples/demo-agent && pnpm exercise
```

Open `http://127.0.0.1:4110` in your browser and you'll see the events generated by the terminal 3 command stream in in real time. For reproducing real debugging scenarios like chat recovery, schedule warnings, and MCP failures, see the ["Reproducing the debugging scenarios"](README.md#reproducing-the-debugging-scenarios) section of README.md.
