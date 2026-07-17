import os from "node:os";
import path from "node:path";

import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { assertRegularFile, sha256File } from "./fs-safe.mjs";
import { requireSuccess, runProcess } from "./process.mjs";
import { sanitizedEnvironment } from "./runtime.mjs";

const SPEC_VERSION = 1;

export async function buildExecutionSpec(config, { input, profile, runtime, skills }) {
  const commands = config.profiles[profile];
  if (!commands) throw new LoopGatewayError("UNKNOWN_PROFILE", `未知 Shadow Profile：${profile}`);
  assertPolicy(config, commands);
  const toolchain = await resolveToolchain(config, profile);
  const context = {
    baseRevision: input.gitCommit,
    gitTree: input.gitTree,
    workItem: { path: input.relative, sha256: input.workItemHash }
  };
  const contextDigest = canonicalSha256(context);
  const contract = {
    specVersion: SPEC_VERSION,
    baseRevision: input.gitCommit,
    profile,
    skill: {
      sourceCommit: config.loopany.commit,
      manifestDigest: skills.manifestDigest
    },
    runtime: {
      loopanyCommit: runtime.head,
      loopanyCliVersion: runtime.cliVersion,
      bunVersion: runtime.bunVersion,
      nodeVersion: process.version,
      pnpmVersion: toolchain.pnpmVersion,
      pnpmEntrySha256: toolchain.pnpmEntrySha256,
      host: toolchain.host,
      manifestDigest: toolchain.manifestDigest,
      javaVersion: toolchain.javaVersion,
      mavenVersion: toolchain.mavenVersion,
      playwrightVersion: toolchain.playwrightVersion
    },
    inputs: [context.workItem],
    commands: commands.map((argv, index) => ({
      operationId: `profile:${profile}:${index + 1}`,
      argv
    })),
    acceptance: [
      "all_commands_exit_zero",
      "git_revision_unchanged",
      "tracked_file_mtime_unchanged",
      "evidence_and_receipt_digest_match",
      "loopany_doctor_passes"
    ],
    contextDigest,
    budgets: {
      maxDurationSeconds: config.shadowPolicy.maxCommandSeconds,
      maxOperations: config.shadowPolicy.maxCommands,
      maxOutputBytes: config.shadowPolicy.maxOutputBytes,
      maxAttempts: config.shadowPolicy.maxAttempts,
      maxBusinessFileMutations: 0
    },
    mutationPermissions: {
      enabled: config.shadowPolicy.mutationEnabled,
      allowedPaths: [],
      remoteGitWrite: config.shadowPolicy.remoteGitWrite,
      autoSkillActivation: config.shadowPolicy.autoSkillActivation
    },
    staticConfigDigest: canonicalSha256({
      projectId: config.projectId,
      loopany: config.loopany,
      profiles: config.profiles,
      shadowPolicy: config.shadowPolicy
    })
  };
  const specDigest = canonicalSha256(contract);
  const runId = `run-${specDigest.slice(0, 24)}`;
  return {
    runId,
    specDigest,
    spec: {
      ...contract,
      runId,
      executionId: `${runId}-exec`,
      taskId: `${runId}-task`,
      idempotencyKey: specDigest
    },
    runner: toolchain
  };
}

function assertPolicy(config, commands) {
  const policy = config.shadowPolicy;
  if (!policy || policy.requireCleanWorktree !== true
    || policy.mutationEnabled !== false
    || policy.remoteGitWrite !== false
    || policy.autoSkillActivation !== false
    || !Array.isArray(policy.unexpectedErrorPatterns)
    || policy.unexpectedErrorPatterns.length < 1
    || policy.unexpectedErrorPatterns.some((pattern) => typeof pattern !== "string" || !pattern)) {
    throw new LoopGatewayError("UNSAFE_SHADOW_POLICY", "Shadow 代码级禁令被放宽");
  }
  for (const [name, value] of Object.entries({
    maxCommands: policy.maxCommands,
    maxCommandSeconds: policy.maxCommandSeconds,
    maxOutputBytes: policy.maxOutputBytes,
    maxAttempts: policy.maxAttempts
  })) {
    if (!Number.isInteger(value) || value < 1) {
      throw new LoopGatewayError("INVALID_SHADOW_BUDGET", `${name} 必须是正整数`);
    }
  }
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > policy.maxCommands) {
    throw new LoopGatewayError("PROFILE_BUDGET_EXCEEDED", "Profile 命令数超过固定预算");
  }
  for (const command of commands) {
    if (!Array.isArray(command) || command.length !== 2 || command[0] !== "pnpm"
      || typeof command[1] !== "string" || !/^[a-z][a-z0-9:-]*$/.test(command[1])) {
      throw new LoopGatewayError("PROFILE_COMMAND_DENIED", "Profile 只允许一个固定 pnpm script 参数");
    }
  }
}

async function resolveToolchain(config, profile) {
  const pnpmEntryValue = process.env.npm_execpath;
  if (!pnpmEntryValue || !path.isAbsolute(pnpmEntryValue)) {
    throw new LoopGatewayError("PNPM_ENTRY_MISSING", "Shadow 必须从根 pnpm 脚本启动");
  }
  const pnpmEntry = await assertRegularFile(pnpmEntryValue, "pnpm JS 入口");
  const nodeExecutable = await assertRegularFile(
    process.env.npm_node_execpath ?? process.execPath,
    "Node 运行时"
  );
  const pnpmVersion = requireSuccess(
    await runProcess(nodeExecutable, [pnpmEntry, "--version"], {
      cwd: config.repoRoot,
      env: sanitizedEnvironment({
        npm_execpath: pnpmEntry,
        npm_node_execpath: nodeExecutable
      })
    }),
    "读取 pnpm 版本"
  ).stdout.trim();
  const versionEnvironment = sanitizedEnvironment({
    npm_execpath: pnpmEntry,
    npm_node_execpath: nodeExecutable
  });
  const requiresServer = profile === "quality-server" || profile === "smoke";
  const requiresPlaywright = profile === "smoke";
  const javaVersion = requiresServer
    ? firstVersionLine(await runProcess("java", ["-version"], { env: versionEnvironment }), "Java")
    : null;
  const mavenVersion = requiresServer
    ? firstVersionLine(await runProcess(nodeExecutable, [
      path.join(config.repoRoot, "scripts", "run-maven.mjs"), "--version"
    ], { cwd: config.repoRoot, env: versionEnvironment, timeoutMs: 60_000 }), "Maven")
    : null;
  const playwrightVersion = requiresPlaywright
    ? requireSuccess(await runProcess(nodeExecutable, [pnpmEntry, "exec", "playwright", "--version"], {
      cwd: config.repoRoot,
      env: versionEnvironment
    }), "读取 Playwright 版本").stdout.trim()
    : null;
  const manifestDigest = canonicalSha256(await Promise.all([
    "package.json",
    "pnpm-lock.yaml",
    "playwright.config.ts",
    "apps/web/package.json",
    "apps/server/package.json",
    "apps/server/pom.xml",
    "apps/server/mvnw",
    "apps/server/.mvn/wrapper/maven-wrapper.properties",
    "scripts/loop/loop.config.json"
  ].map(async (relative) => ({ relative, sha256: await optionalFileDigest(config.repoRoot, relative) }))));
  return {
    pnpmEntry,
    nodeExecutable,
    pnpmVersion,
    pnpmEntrySha256: await sha256File(pnpmEntry),
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release()
    },
    manifestDigest,
    javaVersion,
    mavenVersion,
    playwrightVersion
  };
}

function firstVersionLine(result, label) {
  requireSuccess(result, `读取 ${label} 版本`);
  const line = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).find((item) => item.trim());
  if (!line) throw new LoopGatewayError("TOOLCHAIN_VERSION_MISSING", `${label} 未返回版本`);
  return line.trim();
}

async function optionalFileDigest(repoRoot, relative) {
  try {
    return await sha256File(path.join(repoRoot, ...relative.split("/")));
  } catch {
    return "missing";
  }
}
