import process from "node:process";

import { resolveGatewayConfig } from "./config.mjs";
import { formatError, LoopGatewayError } from "./errors.mjs";
import {
  backupLoop,
  clearStaleLockRecovery,
  initializeLoop,
  preflightL3Loop,
  doctorLoop,
  finalizeFailedRecovery,
  recoverLoop,
  restoreLoop,
  runL3DraftLoop,
  resumePostcheckRecovery,
  statusLoop,
  syncSkillsRecorded
} from "./operations.mjs";
import { verifyRuntime } from "./runtime.mjs";
import { summarizeReceiptIntegrity, verifyReceiptSet } from "./receipt-integrity.mjs";
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
  } else if (args[0] === "receipts" && args[1] === "verify" && args.length === 2) {
    await verifyRuntime(config);
    result = summarizeReceiptIntegrity(await verifyReceiptSet(config));
  } else if (args[0] === "l3" && args[1] === "preflight") {
    const flags = parseFlags(args.slice(2), new Set(["--plan"]));
    result = await preflightL3Loop(config, requireFlag(flags, "--plan"));
  } else if (args[0] === "l3" && args[1] === "run-draft") {
    const flags = parseFlags(args.slice(2), new Set(["--plan"]));
    result = await runL3DraftLoop(config, requireFlag(flags, "--plan"));
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
      "用法：loop <init|doctor|status|receipts verify|l3 preflight --plan <file>|l3 run-draft --plan <file>|backup|restore --backup <id> --target <path>|recover [--finalize-failed|--resume-postcheck|--clear-stale-lock <id>]|skills sync|skills verify|shadow --work-item <path> [--profile docs|gateway]>"
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

function requireFlag(flags, name) {
  const value = flags.get(name);
  if (!value) throw new LoopGatewayError("USAGE", `缺少必需参数：${name}`);
  return value;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatError(error), null, 2)}\n`);
  process.exitCode = 1;
});
