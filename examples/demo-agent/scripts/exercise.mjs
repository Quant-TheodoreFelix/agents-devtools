import { AgentClient } from "agents/client";

const host = process.env.DEMO_HOST ?? "127.0.0.1:8787";

const res = await fetch(`http://${host}/agents/demo-agent/demo`);
console.log("http onRequest:", res.status, await res.text());

const client = new AgentClient({ agent: "demo-agent", name: "demo", host });
await new Promise((resolve, reject) => {
  client.addEventListener("open", resolve, { once: true });
  client.addEventListener("error", reject, { once: true });
});
console.log("ws connected (lifecycle connect)");

console.log("rpc greet:", await client.call("greet", ["world"]));
console.log("rpc greet:", await client.call("greet", ["again"]));

try {
  await client.call("fail", []);
  console.log("fail: unexpected success");
} catch {
  console.log("rpc fail -> rpc:error emitted");
}

console.log("rpc scheduleTick:", await client.call("scheduleTick", [1]));
await new Promise((r) => setTimeout(r, 2500));

client.close();
console.log("ws closed (lifecycle disconnect)");
console.log("done — events should be visible in the DevTools UI");
setTimeout(() => process.exit(0), 500);
