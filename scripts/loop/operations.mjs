import { lstat, readdir } from "node:fs/promises";

import {
  addRef,
  appendOutcome,
  createArtifact,
  getArtifact,
  readRefs,
  requireArtifact,
  setStatus
} from "./artifacts.mjs";
import { createBackup, restoreBackup, verifyBackup, verifyRestoredLoop } from "./backup.mjs";
import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { readGitState } from "./git-state.mjs";
import { ensureIdentity, MISSION_ID, verifyIdentity } from "./identity.mjs";
import { installProjectKinds, verifyProjectKinds } from "./kinds.mjs";
import {
  acquireWriteLock,
  inspectWriteLock,
  quarantineStaleWriteLock
} from "./lock.mjs";
import { runRecordedOperation } from "./recorded-operation.mjs";
import { runLoopAny, verifyRuntime } from "./runtime.mjs";
import { verifyRunClosure } from "./shadow.mjs";
import { syncSkills, verifySkills } from "./skills.mjs";
import {
  checkpointExistingTransaction,
  inspectTransactions,
  TERMINAL_TRANSACTION_STATES,
  verifyReceiptFile,
  writeReceipt
} from "./transactions.mjs";
import { verifyWorkspaceContract } from "./workspace-check.mjs";

export async function initializeLoop(config, options = {}) {
  const runtime = await verifyRuntime(config);
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, "init", git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "init",
      expectedRevision: git.gitCommit,
      targets: ["loop-workspace", "skill-snapshot"],
      rollback: "初始化为幂等补全；失败事务显式终结后重新运行，不覆盖漂移文件。",
      input: { projectId: config.projectId, sourceCommit: config.loopany.commit },
      faultAfter: options.faultAfter,
      apply: async ({ transaction }) => {
        const skills = await syncSkills(config);
        const preUpgradeBackup = await backupBeforeCompatibleKindUpgrade(config, transaction.id, git.gitCommit);
        const init = await runLoopAny(config, ["init"]);
        const kinds = await installProjectKinds(config);
        const identity = await ensureIdentity(config);
        const transactionArtifact = await createTransactionArtifact(config, transaction.id, "init");
        await setStatus(config, transactionArtifact, "active");
        await appendOutcome(config, transactionArtifact, "固定 Runtime、Skill、Kind 与工程 Mission 已完成初始化。" );
        await setStatus(config, transactionArtifact, "committed");
        return {
          skills,
          kinds,
          identity,
          loopany: init.stdout.trim(),
          preUpgradeBackup,
          transactionArtifact,
          receipt: { transactionArtifact, skills: skills.files, kinds, preUpgradeBackup },
          recovery: { transactionArtifact, preUpgradeBackupId: preUpgradeBackup?.backupId }
        };
      },
      postcheck: async () => summarizeWorkspaceVerification(await verifyWorkspaceContract(config))
    });
    return {
      ok: true,
      operation: "init",
      runtime: summarizeRuntime(runtime),
      ...recorded.applied,
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256,
      verification: recorded.verification
    };
  } finally {
    await lock.release();
  }
}

async function backupBeforeCompatibleKindUpgrade(config, transactionId, expectedRevision) {
  const workspaceExists = await lstat(config.workspace).catch(() => null);
  if (!workspaceExists) return null;
  try {
    await verifyProjectKinds(config);
    return null;
  } catch (error) {
    if (!(error instanceof LoopGatewayError) || error.code !== "PROJECT_KIND_SET_DRIFT") throw error;
    const expected = new Set(error.details?.expected ?? []);
    const actual = new Set(error.details?.actual ?? []);
    const addedByThisVersion = new Set(["execution-spec.md", "outcome.md"]);
    const missing = [...expected].filter((name) => !actual.has(name));
    const extra = [...actual].filter((name) => !expected.has(name));
    if (extra.length > 0 || missing.some((name) => !addedByThisVersion.has(name))) {
      throw new LoopGatewayError("PROJECT_KIND_UPGRADE_DENIED", "Kind 漂移不属于本版本兼容增量", {
        missing,
        extra
      });
    }
    await verifyLegacyWorkspace(config);
    return await createBackup(config, {
      expectedRevision,
      excludeTransactionId: transactionId
    });
  }
}

async function verifyLegacyWorkspace(config) {
  await verifySkills(config);
  await verifyIdentity(config);
  const doctor = await runLoopAny(config, ["doctor", "--format", "json"], {
    json: true,
    allowFailure: true
  });
  if (doctor.code !== 0 || doctor.json?.ok !== true) {
    throw new LoopGatewayError("PRE_UPGRADE_DOCTOR_FAILED", "升级前 LoopAny Doctor 未通过", doctor.json);
  }
  return doctor.json;
}

export async function syncSkillsRecorded(config, options = {}) {
  const runtime = await verifyRuntime(config);
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, "skills:sync", git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "skills:sync",
      expectedRevision: git.gitCommit,
      targets: ["skill-snapshot"],
      rollback: "目标快照不可变；失败临时目录只保留诊断，下一次使用新临时目录。",
      input: { sourceCommit: config.loopany.commit, skills: config.loopany.skills },
      faultAfter: options.faultAfter,
      apply: async () => {
        const skills = await syncSkills(config);
        return { skills, receipt: skills, recovery: { snapshot: config.skillSnapshot } };
      },
      postcheck: async () => await verifySkills(config)
    });
    return {
      ok: true,
      operation: "skills:sync",
      runtime: summarizeRuntime(runtime),
      skills: recorded.applied.skills,
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256
    };
  } finally {
    await lock.release();
  }
}

export async function doctorLoop(config, options = {}) {
  const runtime = await verifyRuntime(config);
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, "doctor", git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "doctor",
      expectedRevision: git.gitCommit,
      targets: ["loop-workspace-audit"],
      rollback: "Doctor 不修改工程事实；仅追加 LoopAny Audit 与 Gateway Receipt。",
      input: { sourceCommit: config.loopany.commit },
      faultAfter: options.faultAfter,
      apply: async () => {
        const report = await verifyWorkspaceContract(config);
        return {
          report,
          receipt: summarizeWorkspaceVerification(report),
          recovery: { doctorOk: report.loopany.ok }
        };
      },
      postcheck: async (applied) => summarizeWorkspaceVerification(applied.report)
    });
    return {
      ok: true,
      operation: "doctor",
      runtime: summarizeRuntime(runtime),
      skills: recorded.applied.report.skills,
      kinds: recorded.applied.report.kinds,
      loopany: recorded.applied.report.loopany,
      audit: recorded.applied.report.audit,
      capabilities: recorded.applied.report.capabilities,
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256
    };
  } finally {
    await lock.release();
  }
}

export async function backupLoop(config, options = {}) {
  const runtime = await verifyRuntime(config);
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, "backup", git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "backup",
      expectedRevision: git.gitCommit,
      targets: ["backup-root"],
      rollback: "Backup 目录不可变；失败 staging 保留诊断，不影响活动 Workspace。",
      input: { sourceCommit: config.loopany.commit },
      faultAfter: options.faultAfter,
      apply: async ({ transaction }) => {
        await verifyWorkspaceContract(config);
        const backup = await createBackup(config, {
          expectedRevision: git.gitCommit,
          excludeTransactionId: transaction.id
        });
        return { backup, receipt: backup, recovery: { backupId: backup.backupId } };
      },
      postcheck: async (applied) => await verifyBackup(config, applied.backup.backupId)
    });
    return {
      ok: true,
      operation: "backup",
      runtime: summarizeRuntime(runtime),
      ...recorded.applied.backup,
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256
    };
  } finally {
    await lock.release();
  }
}

export async function restoreLoop(config, backupId, target, options = {}) {
  const runtime = await verifyRuntime(config);
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, `restore:${backupId}`, git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "restore",
      expectedRevision: git.gitCommit,
      targets: ["isolated-restore-target"],
      rollback: "Restore 只写新目录；失败目录保留诊断，禁止覆盖活动 Workspace。",
      input: { backupId, target },
      faultAfter: options.faultAfter,
      apply: async () => {
        const restored = await restoreBackup(config, backupId, target);
        return { restored, receipt: restored, recovery: { backupId, target: restored.target } };
      },
      postcheck: async (applied) => {
        const backup = await verifyBackup(config, applied.restored.backupId);
        return await verifyRestoredLoop(config, applied.restored.target, backup.manifest, {
          skipPayloadComparison: true
        });
      }
    });
    return {
      ok: true,
      operation: "restore",
      runtime: summarizeRuntime(runtime),
      ...recorded.applied.restored,
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256
    };
  } finally {
    await lock.release();
  }
}

export async function statusLoop(config) {
  const recovery = await recoverLoop(config);
  const receipts = await listFiles(config.receiptRoot, ".json");
  const backups = config.backupRoot
    ? (await readdir(config.backupRoot, { withFileTypes: true }).catch((error) => {
      if (error?.code === "ENOENT") return [];
      throw error;
    })).filter((entry) => entry.isDirectory() && entry.name.startsWith("backup-")).map((entry) => entry.name).sort()
    : [];
  return {
    ok: recovery.ok,
    operation: "status",
    writer: recovery.lock,
    incompleteTransactions: recovery.incomplete,
    latestReceipt: receipts.at(-1) ?? null,
    latestBackup: backups.at(-1) ?? null,
    backupConfigured: Boolean(config.backupRoot)
  };
}

export async function recoverLoop(config) {
  const lock = await inspectWriteLock(config);
  const transactions = await inspectTransactions(config);
  const incomplete = transactions
    .filter(({ latest }) => !TERMINAL_TRANSACTION_STATES.has(latest.status))
    .map((item) => ({
      id: item.id,
      operation: item.latest.operation,
      status: item.latest.status,
      phase: item.recoveryPhase,
      runId: item.latest.input?.runId,
      action: recoveryAction(item.recoveryPhase)
    }));
  return {
    ok: lock === null && incomplete.length === 0,
    operation: "recover",
    lock,
    incomplete,
    guidance: lock || incomplete.length > 0
      ? "保留现场；先核验 Writer，再按 action 使用 clear-stale-lock、finalize-failed 或 resume-postcheck。"
      : "未发现残留写锁或未终结事务。"
  };
}

export async function clearStaleLockRecovery(config, token) {
  const cleared = await quarantineStaleWriteLock(config, token);
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, "recover:clear-stale-lock", git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "recover:clear-stale-lock",
      expectedRevision: git.gitCommit,
      targets: ["loop-writer-lock"],
      rollback: "原锁已隔离到 quarantine 并保留，不自动删除审计证据。",
      input: {
        staleTokenDigest: canonicalSha256(token),
        stalePid: cleared.owner.pid,
        staleOperation: cleared.owner.operation
      },
      apply: async () => ({
        cleared,
        receipt: {
          staleTokenDigest: canonicalSha256(token),
          stalePid: cleared.owner.pid,
          quarantine: cleared.quarantine
        },
        recovery: { quarantine: cleared.quarantine }
      }),
      postcheck: async () => {
        if (!await lstat(cleared.quarantine).catch(() => null)) {
          throw new LoopGatewayError("LOCK_QUARANTINE_MISSING", "残留锁隔离证据不存在");
        }
        return { ok: true, quarantine: cleared.quarantine };
      }
    });
    return {
      ok: true,
      operation: "recover-clear-stale-lock",
      quarantine: cleared.quarantine,
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256
    };
  } finally {
    await lock.release();
  }
}

export async function finalizeFailedRecovery(config, identifier) {
  const runtime = await verifyRuntime(config);
  const candidate = await resolveTransaction(config, identifier);
  const phase = candidate.recoveryPhase;
  if (!new Set(["prepared", "applying", "active"]).has(phase)) {
    throw new LoopGatewayError(
      "RECOVERY_PHASE_DENIED",
      `事务阶段 ${phase} 不能按失败终结；${recoveryAction(phase)}`
    );
  }
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, `recover:finalize:${candidate.id}`, git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "recover:finalize-failed",
      expectedRevision: git.gitCommit,
      targets: ["loop-workspace", "transaction-manifest"],
      rollback: "不重放未知写步骤；只把可识别的部分 Artifact 与事务显式终结为失败。",
      input: { candidateTransactionId: candidate.id, candidatePhase: phase },
      apply: async ({ transaction }) => {
        const artifactResult = await finalizeCandidateArtifacts(config, candidate);
        const payload = {
          operation: "recovery",
          outcome: "failed",
          candidateTransactionId: candidate.id,
          candidateOperation: candidate.latest.operation,
          candidatePhase: phase,
          resolvedBy: transaction.id,
          artifacts: artifactResult
        };
        const candidateReceipt = await writeReceipt(config, `${candidate.id}-recovery`, payload);
        await checkpointExistingTransaction(config, candidate.id, "failed", {
          reason: "人工确认不重放未知步骤，按失败终结。",
          resolvedBy: transaction.id,
          receiptFile: candidateReceipt.file,
          receiptSha256: candidateReceipt.integritySha256
        });
        return {
          candidateReceipt,
          artifactResult,
          receipt: payload,
          recovery: { candidateTransactionId: candidate.id }
        };
      },
      postcheck: async (applied) => {
        await verifyReceiptFile(applied.candidateReceipt.file);
        const refreshed = await resolveTransaction(config, candidate.id, true);
        if (refreshed.latest.status !== "failed") {
          throw new LoopGatewayError("RECOVERY_POSTCHECK_FAILED", "候选事务未进入 failed");
        }
        if (applied.artifactResult.runId) {
          await verifyRunClosure(config, applied.artifactResult.runId);
        }
        return { ok: true, candidateStatus: refreshed.latest.status };
      }
    });
    return {
      ok: true,
      operation: "recover-finalize-failed",
      candidateTransactionId: candidate.id,
      runtime: summarizeRuntime(runtime),
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256
    };
  } finally {
    await lock.release();
  }
}

export async function resumePostcheckRecovery(config, transactionId) {
  const runtime = await verifyRuntime(config);
  const candidate = await resolveTransaction(config, transactionId);
  if (!new Set(["source_committed", "postchecking"]).has(candidate.recoveryPhase)) {
    throw new LoopGatewayError(
      "RECOVERY_PHASE_DENIED",
      `事务阶段 ${candidate.recoveryPhase} 不能继续 Postcheck；${recoveryAction(candidate.recoveryPhase)}`
    );
  }
  const git = await readGitState(config);
  const lock = await acquireWriteLock(config, `recover:resume:${candidate.id}`, git);
  try {
    const recorded = await runRecordedOperation(config, {
      operation: "recover:resume-postcheck",
      expectedRevision: git.gitCommit,
      targets: ["loop-workspace", "transaction-manifest"],
      rollback: "只核对已提交状态并补写 Receipt；V0/V1 不一致时保持熔断。",
      input: { candidateTransactionId: candidate.id, candidatePhase: candidate.recoveryPhase },
      apply: async ({ transaction }) => {
        const verification = await resumeCandidatePostcheck(config, candidate);
        if (candidate.latest.status !== "postchecking") {
          await checkpointExistingTransaction(config, candidate.id, "postchecking", {
            resumedBy: transaction.id,
            verification
          });
        }
        const candidateReceipt = await writeReceipt(config, `${candidate.id}-resume`, {
          operation: "recovery-resume-postcheck",
          outcome: "passed",
          candidateTransactionId: candidate.id,
          resolvedBy: transaction.id,
          verification
        });
        await checkpointExistingTransaction(config, candidate.id, "closed", {
          resumedBy: transaction.id,
          receiptFile: candidateReceipt.file,
          receiptSha256: candidateReceipt.integritySha256
        });
        return {
          verification,
          candidateReceipt,
          receipt: { candidateTransactionId: candidate.id, verification },
          recovery: { candidateTransactionId: candidate.id }
        };
      },
      postcheck: async (applied) => {
        await verifyReceiptFile(applied.candidateReceipt.file);
        const refreshed = await resolveTransaction(config, candidate.id, true);
        if (refreshed.latest.status !== "closed") {
          throw new LoopGatewayError("RECOVERY_POSTCHECK_FAILED", "候选事务未进入 closed");
        }
        return { ok: true, candidateStatus: refreshed.latest.status };
      }
    });
    return {
      ok: true,
      operation: "recover-resume-postcheck",
      candidateTransactionId: candidate.id,
      runtime: summarizeRuntime(runtime),
      transactionId: recorded.transactionId,
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256
    };
  } finally {
    await lock.release();
  }
}

async function resumeCandidatePostcheck(config, candidate) {
  const recovery = candidate.latest.details?.recovery ?? lastRecoveryDetails(candidate.history);
  switch (candidate.latest.operation) {
    case "shadow":
      return {
        run: await verifyRunClosure(config, candidate.latest.input.runId),
        workspace: summarizeWorkspaceVerification(await verifyWorkspaceContract(config))
      };
    case "init":
    case "doctor":
      return summarizeWorkspaceVerification(await verifyWorkspaceContract(config));
    case "skills:sync":
      return await verifySkills(config);
    case "backup":
      return await verifyBackup(config, recovery.backupId);
    case "restore":
      return await verifyRestoredLoop(
        config,
        recovery.target,
        (await verifyBackup(config, candidate.latest.input.backupId)).manifest,
        { skipPayloadComparison: true }
      );
    default:
      throw new LoopGatewayError("RECOVERY_OPERATION_UNSUPPORTED", `不支持恢复操作：${candidate.latest.operation}`);
  }
}

async function finalizeCandidateArtifacts(config, candidate) {
  if (candidate.latest.operation !== "shadow") return { runId: null, changed: [] };
  const runId = candidate.latest.input?.runId;
  if (!runId) return { runId: null, changed: [] };
  const run = await getArtifact(config, runId);
  if (!run) return { runId: null, changed: [] };
  if (run.frontmatter.status === "verified") {
    throw new LoopGatewayError("RECOVERY_ALREADY_SUCCEEDED", `Run ${runId} 已 verified，应继续 Postcheck 而非改写失败`);
  }

  const spec = await requireArtifact(config, `${runId}-spec`, "execution-spec");
  let task = await getArtifact(config, `${runId}-task`);
  if (!task) {
    await createArtifact(config, "task", `${runId}-task`, {
      title: `恢复 ${runId}`,
      status: "todo",
      priority: "medium",
      mentions: MISSION_ID
    }, "## Plan\n\n编排在 Execution 创建前中断，按失败终结。" );
    task = await requireArtifact(config, `${runId}-task`, "task");
  }
  let execution = await getArtifact(config, `${runId}-exec`);
  if (!execution) {
    await createArtifact(config, "execution", `${runId}-exec`, {
      title: "recovery execution",
      status: "pending",
      profile: spec.frontmatter.profile,
      "run-id": runId,
      "started-at": new Date().toISOString()
    }, "Operation 未安全开始，由人工恢复终结。" );
    execution = await requireArtifact(config, `${runId}-exec`, "execution");
  }

  const recoveryEvidence = {
    schemaVersion: 1,
    runId,
    transactionId: candidate.id,
    phase: candidate.recoveryPhase,
    outcome: "failed",
    reason: "编排中断且未知步骤不重放。"
  };
  const evidenceId = `${runId}-evidence`;
  let evidence = await getArtifact(config, evidenceId);
  if (!evidence) {
    await createArtifact(config, "evidence", evidenceId, {
      title: "recovery evidence",
      "evidence-type": "runtime",
      "run-id": runId,
      sha256: canonicalSha256(recoveryEvidence),
      source: `transaction:${candidate.id}`,
      "exit-code": -1
    }, JSON.stringify(recoveryEvidence, null, 2));
    evidence = await requireArtifact(config, evidenceId, "evidence");
  }
  const evidenceDigest = evidence.frontmatter.sha256;
  const receiptPayload = {
    schemaVersion: 1,
    operation: "shadow",
    runId,
    outcome: "failed",
    specDigest: spec.frontmatter.digest,
    evidenceDigest,
    commands: [],
    boundaryError: { code: "RECOVERY_FINALIZED", message: "人工失败终结，未重放未知步骤。" }
  };
  const receiptDigest = canonicalSha256(receiptPayload);
  const receiptId = `${runId}-receipt`;
  if (!await getArtifact(config, receiptId)) {
    await createArtifact(config, "receipt", receiptId, {
      title: "recovery shadow receipt",
      outcome: "failed",
      operation: "shadow",
      "run-id": runId,
      sha256: receiptDigest
    }, JSON.stringify(receiptPayload, null, 2));
  }
  const outcomeId = `${runId}-outcome`;
  if (!await getArtifact(config, outcomeId)) {
    await createArtifact(config, "outcome", outcomeId, {
      title: "recovery failed outcome",
      status: "failed",
      "run-id": runId,
      "execution-id": `${runId}-exec`,
      "evidence-digest": evidenceDigest,
      "receipt-digest": receiptDigest,
      "completed-at": new Date().toISOString()
    }, `人工恢复失败终结；Evidence [[${evidenceId}]]，Receipt [[${receiptId}]]。`);
  }

  await ensureRef(config, `${runId}-task`, MISSION_ID, "advances");
  await ensureRef(config, runId, `${runId}-task`, "implements");
  await ensureRef(config, `${runId}-spec`, runId, "specifies");
  await ensureRef(config, `${runId}-exec`, runId, "executes");
  await ensureRef(config, evidenceId, `${runId}-exec`, "evidences");
  await ensureRef(config, outcomeId, evidenceId, "substantiated-by");
  await ensureRef(config, outcomeId, `${runId}-exec`, "evaluates");
  await ensureRef(config, receiptId, outcomeId, "receipts");
  await ensureRef(config, receiptId, runId, "receipts");

  await failArtifact(config, execution, "Execution 在恢复时按失败终结。" );
  await failArtifact(config, task, `人工恢复终结；Outcome [[${outcomeId}]]。`);
  await failArtifact(config, run, `人工恢复终结；Outcome [[${outcomeId}]]。`);
  const transactionArtifactId = lastRecoveryDetails(candidate.history).transactionArtifact;
  const transactionArtifact = transactionArtifactId ? await getArtifact(config, transactionArtifactId) : null;
  if (transactionArtifact) await failArtifact(config, transactionArtifact, "外部事务按失败终结。" );
  return { runId, changed: [runId, `${runId}-task`, `${runId}-exec`, outcomeId, receiptId] };
}

async function failArtifact(config, artifact, reason) {
  if (artifact.frontmatter.status === "failed") return;
  const successful = new Set(["verified", "passed", "done", "committed"]);
  if (successful.has(artifact.frontmatter.status)) {
    throw new LoopGatewayError("RECOVERY_STATUS_DENIED", `${artifact.id} 已成功终态，拒绝改写失败`);
  }
  if (!artifact.body.includes("## Outcome")) await appendOutcome(config, artifact.id, reason);
  if (artifact.kind === "task" && artifact.frontmatter.status === "todo") {
    await setStatus(config, artifact.id, "running");
  }
  await setStatus(config, artifact.id, "failed", reason);
}

async function ensureRef(config, from, to, relation) {
  const refs = await readRefs(config, from, 1);
  if (!refs.some((edge) => edge.from === from && edge.to === to && edge.relation === relation)) {
    await addRef(config, from, to, relation);
  }
}

async function createTransactionArtifact(config, externalId, operation) {
  const result = await createArtifact(config, "transaction", `tx-${externalId}`, {
    title: `${operation} transaction`,
    operation,
    "external-id": externalId
  }, "外部追加事务清单是恢复事实源；本 Artifact 提供审计入口。" );
  return result.id;
}

async function resolveTransaction(config, identifier, allowTerminal = false) {
  const transactions = await inspectTransactions(config);
  let candidates;
  if (/^\d{14}-[a-f0-9-]{36}$/.test(identifier ?? "")) {
    candidates = transactions.filter((item) => item.id === identifier);
  } else if (/^run-[a-f0-9]{24}$/.test(identifier ?? "")) {
    candidates = transactions.filter((item) => item.latest.input?.runId === identifier
      && (allowTerminal || !TERMINAL_TRANSACTION_STATES.has(item.latest.status)));
  } else {
    throw new LoopGatewayError("INVALID_RECOVERY_ID", `非法 Recovery 标识：${identifier}`);
  }
  if (candidates.length !== 1) {
    throw new LoopGatewayError(
      "RECOVERY_AMBIGUOUS",
      `期望 1 个候选事务，实际 ${candidates.length}`,
      candidates.map((item) => item.id)
    );
  }
  if (!allowTerminal && TERMINAL_TRANSACTION_STATES.has(candidates[0].latest.status)) {
    throw new LoopGatewayError("TRANSACTION_TERMINAL", `事务已终结：${candidates[0].id}`);
  }
  return candidates[0];
}

function lastRecoveryDetails(history) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].details?.recovery) return history[index].details.recovery;
  }
  return {};
}

function recoveryAction(phase) {
  if (new Set(["prepared", "applying", "active"]).has(phase)) return "finalize-failed";
  if (new Set(["source_committed", "postchecking"]).has(phase)) return "resume-postcheck";
  return "manual-inspection";
}

function summarizeWorkspaceVerification(report) {
  return {
    ok: report.ok,
    skillFiles: report.skills.files,
    skillDigest: report.skills.manifestDigest,
    kinds: report.kinds.kinds,
    artifacts: report.loopany.checks.find((item) => item.name === "artifacts")?.detail,
    references: report.loopany.checks.find((item) => item.name === "references")?.detail,
    auditEntries: report.audit.entries,
    capabilities: report.capabilities
  };
}

function summarizeRuntime(runtime) {
  return {
    commit: runtime.head,
    bunVersion: runtime.bunVersion,
    cliVersion: runtime.cliVersion
  };
}

async function listFiles(root, extension) {
  return (await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  })).filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name).sort();
}
