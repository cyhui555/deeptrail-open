import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LoopGatewayError } from "./errors.mjs";
import {
  assertDisjoint,
  assertOutside,
  canonicalizePlannedPath,
  normalizePath
} from "./fs-safe.mjs";
import { requireSuccess, runProcess } from "./process.mjs";

const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const configFile = path.join(moduleRoot, "loop.config.json");

export async function loadStaticConfig() {
  const parsed = JSON.parse(await readFile(configFile, "utf8"));
  if (parsed.schemaVersion !== 1 || parsed.projectId !== "deeptrail") {
    throw new LoopGatewayError("INVALID_CONFIG", "scripts/loop/loop.config.json 不受支持");
  }
  return parsed;
}

export async function resolveGatewayConfig(options = {}) {
  const staticConfig = options.staticConfig ?? await loadStaticConfig();
  const env = options.env ?? process.env;
  const repoRoot = await canonicalizePlannedPath(
    normalizePath(options.repoRoot ?? await discoverRepoRoot(options.cwd)),
    "Git 工作树"
  );
  const loopHome = await requiredAbsolute(env.DEEPTRAIL_LOOP_HOME, "DEEPTRAIL_LOOP_HOME");
  const sourceRoot = await requiredAbsolute(env.LOOPANY_SOURCE_ROOT, "LOOPANY_SOURCE_ROOT");
  const bun = await requiredAbsolute(env.LOOPANY_BUN, "LOOPANY_BUN");
  const backupRoot = env.DEEPTRAIL_LOOP_BACKUP_ROOT
    ? await requiredAbsolute(env.DEEPTRAIL_LOOP_BACKUP_ROOT, "DEEPTRAIL_LOOP_BACKUP_ROOT")
    : undefined;

  // 运行态进入 Git 会污染事实源，也可能把 Artifact 或用户输入误提交。
  assertOutside(repoRoot, loopHome, "DEEPTRAIL_LOOP_HOME");
  if (backupRoot) {
    assertOutside(repoRoot, backupRoot, "DEEPTRAIL_LOOP_BACKUP_ROOT");
    assertDisjoint(loopHome, backupRoot, ["DEEPTRAIL_LOOP_HOME", "DEEPTRAIL_LOOP_BACKUP_ROOT"]);
  }

  return {
    ...staticConfig,
    repoRoot,
    loopHome,
    backupRoot,
    sourceRoot,
    bun,
    loopanyCli: path.join(sourceRoot, "src", "cli.ts"),
    workspace: path.join(loopHome, "workspace"),
    skillSnapshot: path.join(loopHome, "runtime", "skills", staticConfig.loopany.commit),
    lockFile: path.join(loopHome, "locks", "writer.lock"),
    transactionRoot: path.join(loopHome, "transactions"),
    receiptRoot: path.join(loopHome, "receipts")
  };
}

async function discoverRepoRoot(cwd = process.cwd()) {
  const result = requireSuccess(
    await runProcess("git", ["rev-parse", "--show-toplevel"], { cwd }),
    "定位 Git 根目录"
  );
  return result.stdout.trim();
}

async function requiredAbsolute(value, name) {
  if (!value) {
    throw new LoopGatewayError("MISSING_ENV", `必须显式设置 ${name}`);
  }
  if (!path.isAbsolute(value)) {
    throw new LoopGatewayError("INVALID_ENV", `${name} 必须是绝对路径`);
  }
  return await canonicalizePlannedPath(value, name);
}

export function requireBackupRoot(config) {
  if (!config.backupRoot) {
    throw new LoopGatewayError(
      "MISSING_ENV",
      "备份或 Restore 必须显式设置 DEEPTRAIL_LOOP_BACKUP_ROOT"
    );
  }
  return config.backupRoot;
}
