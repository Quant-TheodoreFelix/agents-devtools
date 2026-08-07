import { AgentClient } from "agents/client";

const host = process.env.DEMO_HOST ?? "127.0.0.1:8787";
const scenario = process.argv[2] ?? "all";

function connect() {
  const client = new AgentClient({
    agent: "demo-chat-agent",
    name: "demo",
    host
  });
  return new Promise((resolve, reject) => {
    client.addEventListener("open", () => resolve(client), { once: true });
    client.addEventListener("error", reject, { once: true });
  });
}

async function s1(client) {
  console.log("[S1] stall once -> recovery completed");
  console.log("  setStall:", await client.call("setStall", ["once"]));
  const first = await client.call("say", ["hello, please stall"]);
  console.log("  say (stalls after 2s):", JSON.stringify(first));
  console.log("  waiting for recovery alarm (~10s)...");
  await new Promise((r) => setTimeout(r, 10_000));

  console.log("[S1] stall always -> recovery failed");
  console.log("  setStall:", await client.call("setStall", ["always"]));
  const second = await client.call("say", ["hello, stall forever"]);
  console.log("  say (stalls after 2s):", JSON.stringify(second));
  console.log("  waiting for terminal failure (~25s)...");
  await new Promise((r) => setTimeout(r, 25_000));
  console.log("  setStall:", await client.call("setStall", ["none"]));
}

async function s2(client) {
  console.log("[S2] schedule burst -> schedule:duplicate_warning");
  const count = await client.call("scheduleBurst", [12]);
  console.log(`  scheduled ${count} one-shots for +1s`);
  console.log("  waiting for alarm cycle (~4s)...");
  await new Promise((r) => setTimeout(r, 4_000));
}

async function s4(client) {
  console.log("[S4] broken MCP server -> mcp:client:connect error");
  const result = await client.call("connectBrokenMcp", []);
  console.log("  connectBrokenMcp:", result);
}

const client = await connect();
console.log(`ws connected to demo-chat-agent/demo (scenario: ${scenario})`);

if (scenario === "s1" || scenario === "all") await s1(client);
if (scenario === "s2" || scenario === "all") await s2(client);
if (scenario === "s4" || scenario === "all") await s4(client);

client.close();
console.log("done — check the Chat / Schedules / Connections tabs");
setTimeout(() => process.exit(0), 500);
