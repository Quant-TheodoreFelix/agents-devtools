import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const collectorRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(collectorRoot, "..", "..");

cpSync(join(repoRoot, "LICENSE"), join(collectorRoot, "LICENSE"));
cpSync(join(repoRoot, "README.md"), join(collectorRoot, "README.md"));

const uiDist = join(repoRoot, "packages", "ui", "dist");
if (!existsSync(join(uiDist, "index.html"))) {
  throw new Error(
    "packages/ui/dist is missing - run `pnpm --filter @agents-devtools/ui build` before packing"
  );
}
cpSync(uiDist, join(collectorRoot, "ui-dist"), { recursive: true });
