import path from "node:path";

import { runNode, withTrackedWorkspace } from "./quality-workspace.mjs";

await withTrackedWorkspace("quality-smoke", async (workspace) => {
  await runNode(workspace, [path.join(workspace, "scripts", "run-e2e.mjs"), "smoke.spec.ts"]);
});
