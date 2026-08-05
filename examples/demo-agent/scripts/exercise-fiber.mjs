const endpoint =
  process.env.DEVTOOLS_ENDPOINT ?? "http://127.0.0.1:4111/ingest";

const send = async (type, payload) => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      v: 1,
      events: [
        {
          channel: "agents:fiber",
          event: {
            type,
            agent: "DemoAgent",
            name: "demo",
            payload,
            timestamp: Date.now()
          }
        }
      ]
    })
  });
  if (!res.ok) throw new Error(`ingest failed: ${res.status}`);
  console.log("sent", type, JSON.stringify(payload));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("fiber:run:started", { fiberId: "fib-a", fiberName: "chat-turn" });
await sleep(300);
await send("fiber:run:started", { fiberId: "fib-b", fiberName: "summarize" });
await sleep(400);
await send("fiber:run:completed", {
  fiberId: "fib-a",
  fiberName: "chat-turn",
  elapsedMs: 700
});
await sleep(200);
await send("fiber:recovery:detected", { fiberId: "fib-b" });
await sleep(200);
await send("fiber:run:failed", { fiberId: "fib-b", fiberName: "summarize" });

console.log(
  "synthetic fiber events sent — check the Timeline tab for spans (fib-a completed, fib-b failed)"
);
