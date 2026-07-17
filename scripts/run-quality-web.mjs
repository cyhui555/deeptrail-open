import { runPnpm, withTrackedWorkspace } from "./quality-workspace.mjs";

await withTrackedWorkspace("quality-web", async (workspace) => {
  await runPnpm(workspace, ["--filter", "@deeptrail/web", "lint"]);
  await runPnpm(workspace, ["--filter", "@deeptrail/web", "typecheck"]);
  await runPnpm(workspace, ["--filter", "@deeptrail/web", "build"]);
  await runPnpm(workspace, ["perf:check"]);
});
