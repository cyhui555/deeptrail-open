import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { resolveGatewayConfig } from "./config.mjs";
import { requireSuccess, runProcess } from "./process.mjs";
import { doctorLoop, initializeLoop, recoverLoop } from "./operations.mjs";
import { runShadow } from "./shadow.mjs";

const AUDITED_REVISION = "4523ad2126d45435d85ff88144525fb709d20b47";
const WORK_ITEMS = [
  "docs/issues/BUG-20260715-001-map-unavailable.md",
  "docs/issues/BUG-20260715-002-ai-mock-data.md",
  "docs/issues/BUG-20260715-003-loopback-login-403.md",
  "docs/issues/TASK-M0-001-travel-migration.md",
  "docs/issues/TASK-M1-001-production-hardening.md",
  "docs/issues/TASK-M2-001-service-responsibility-refactor.md",
  "docs/issues/TASK-M3-001-ui-brand-redesign.md",
  "docs/issues/TASK-M4-001-longcat-provider-switch.md",
  "docs/issues/TASK-M5-001-warm-editorial-redesign.md",
  "docs/issues/TASK-M6-001-mobile-blue-ui.md"
];

for (const name of ["LOOPANY_SOURCE_ROOT", "LOOPANY_BUN"]) {
  if (!process.env[name]) throw new Error(`M4 Shadow 审计需要 ${name}`);
}

const sourceRepo = requireSuccess(
  await runProcess("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() }),
  "定位源仓库"
).stdout.trim();
const auditRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-m4-audit-"));
try {
  const repoRoot = path.join(auditRoot, "repo");
  requireSuccess(await runProcess("git", [
    "clone", "--quiet", "--no-hardlinks", "--no-checkout", sourceRepo, repoRoot
  ]), "克隆历史审计仓库");
  requireSuccess(await runProcess("git", ["checkout", "--quiet", AUDITED_REVISION], {
    cwd: repoRoot
  }), "检出历史真实 Work Item Revision");

  const config = await resolveGatewayConfig({
    repoRoot,
    env: {
      ...process.env,
      DEEPTRAIL_LOOP_HOME: path.join(auditRoot, "loop-home"),
      DEEPTRAIL_LOOP_BACKUP_ROOT: path.join(auditRoot, "backups")
    }
  });
  await initializeLoop(config);
  const entries = [];
  for (const workItem of WORK_ITEMS) {
    const first = await runShadow(config, { workItem, profile: "docs" });
    const second = await runShadow(config, { workItem, profile: "docs" });
    entries.push({
      workItem,
      runId: first.runId,
      firstStatus: first.status,
      firstReused: first.reused,
      repeatedStatus: second.status,
      repeatedReused: second.reused,
      boundaryViolation: first.boundaryViolation ?? false
    });
  }

  const verified = entries.filter((item) => item.firstStatus === "verified").length;
  const reused = entries.filter((item) => item.repeatedReused
    && item.repeatedStatus === item.firstStatus).length;
  const terminal = entries.filter((item) =>
    ["verified", "failed"].includes(item.firstStatus)).length;
  const boundaryViolations = entries.filter((item) => item.boundaryViolation).length;
  const doctor = await doctorLoop(config);
  const recovery = await recoverLoop(config);
  const report = {
    schemaVersion: 1,
    auditedRevision: AUDITED_REVISION,
    workItemCount: entries.length,
    metrics: {
      firstVerificationSuccessRate: verified / entries.length,
      idempotentReuseSuccessRate: reused / entries.length,
      closureRate: terminal / entries.length,
      boundaryViolationRate: boundaryViolations / entries.length
    },
    doctorOk: doctor.ok,
    recoveryOk: recovery.ok,
    entries
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (verified !== entries.length || reused !== entries.length
      || terminal !== entries.length || boundaryViolations !== 0
      || !doctor.ok || !recovery.ok) {
    process.exitCode = 1;
  }
} finally {
  const expectedRoot = path.resolve(os.tmpdir());
  if (!path.resolve(auditRoot).startsWith(expectedRoot + path.sep)) {
    throw new Error("拒绝清理非系统临时目录");
  }
  await rm(auditRoot, { recursive: true, force: true });
}
