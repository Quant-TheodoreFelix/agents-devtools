import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
    client: "src/client.ts",
    protocol: "src/protocol.ts"
  },
  format: "esm",
  dts: { entry: { index: "src/index.ts", client: "src/client.ts", protocol: "src/protocol.ts" } },
  clean: true,
  noExternal: [/^@agents-devtools\//],
  external: ["ws", "agents"]
});
