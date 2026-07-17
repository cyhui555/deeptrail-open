import process from "node:process";

import { resolveGatewayConfig } from "./config.mjs";
import { formatError, LoopGatewayError } from "./errors.mjs";
import {
  backupLoop,
  clearStaleLockRecovery,
  initializeLoop,
  doctorLoop,
  finalizeFailedRecovery,
  recoverLoop,
  restoreLoop,
  resumePostcheckRecovery,
  statusLoop,
  syncSkillsRecorded
} from "./operations.mjs";
import { verifyRuntime } from "./runtime.mjs";
import { runShadow } from "./shadow.mjs";
import { verifySkills } from "./skills.mjs";

async function main() {
  const args = process.argv.slice(2);
  const config = await resolveGatewayConfig();
  let result;

  if (args[0] === "init" && args.length === 1) {
    result = await initializeLoop(config);
  } else if (args[0] === "doctor" && args.length === 1) {
    result = await doctorLoop(config);
  } else if (args[0] === "recover" && args.length === 1) {
    result = await recoverLoop(config);
  } else if (args[0] === "recover" && args[1] === "--finalize-failed" && args.length === 3) {
    result = await finalizeFailedRecovery(config, args[2]);
  } else if (args[0] === "recover" && args[1] === "--resume-postcheck" && args.length === 3) {
    result = await resumePostcheckRecovery(config, args[2]);
  } else if (args[0] === "recover" && args[1] === "--clear-stale-lock" && args.length === 3) {
    result = await clearStaleLockRecovery(config, args[2]);
  } else if (args[0] === "status" && args.length === 1) {
    result = await statusLoop(config);
  } else if (args[0] === "backup" && args.length === 1) {
    result = await backupLoop(config);
  } else if (args[0] === "restore") {
    const flags = parseFlags(args.slice(1), new Set(["--backup", "--target"]));
    result = await restoreLoop(config, flags.get("--backup"), flags.get("--target"));
  } else if (args[0] === "skills" && args[1] === "sync" && args.length === 2) {
    result = await syncSkillsRecorded(config);
  } else if (args[0] === "skills" && args[1] === "verify" && args.length === 2) {
    await verifyRuntime(config);
    result = await verifySkills(config);
  } else if (args[0] === "shadow") {
    const flags = parseFlags(args.slice(1), new Set(["--work-item", "--profile"]));
    result = await runShadow(config, {
      workItem: flags.get("--work-item"),
      profile: flags.get("--profile") ?? "docs"
    });
  } else {
    throw new LoopGatewayError(
      "USAGE",
      "用法：loop <init|doctor|status|backup|restore --backup <id> --target <path>|recover [--finalize-failed|--resume-postcheck|--clear-stale-lock <id>]|skills sync|skills verify|shadow --work-item <path> [--profile docs|gateway]>"
    );
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false) process.exitCode = 1;
}

function parseFlags(args, allowed) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed.has(flag) || value === undefined || value.startsWith("--") || result.has(flag)) {
      throw new LoopGatewayError("USAGE", `非法或重复参数：${flag ?? "(missing)"}`);
    }
    result.set(flag, value);
  }
  return result;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatError(error), null, 2)}\n`);
  process.exitCode = 1;
});
