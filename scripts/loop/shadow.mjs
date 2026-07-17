import { readFile } from "node:fs/promises";

import {
  addRef,
  appendOutcome,
  createArtifact,
  getArtifact,
  readRefs,
  requireArtifact,
  setField,
  setStatus
} from "./artifacts.mjs";
import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { sha256 } from "./fs-safe.mjs";
import { confirmGitStateUnchanged, resolveShadowInput } from "./git-state.mjs";
import { MISSION_ID } from "./identity.mjs";
import { acquireWriteLock } from "./lock.mjs";
import { runProcess } from "./process.mjs";
import { InjectedHardFault, runRecordedOperation } from "./recorded-operation.mjs";
import { sanitizedEnvironment, verifyRuntime } from "./runtime.mjs";
import { buildExecutionSpec } from "./spec.mjs";
import { verifySkills } from "./skills.mjs";
import { verifyWorkspaceContract } from "./workspace-check.mjs";

export function stableRunIdentity(input) {
  const inputHash = canonicalSha256(input);
  return { inputHash, runId: `run-${inputHash.slice(0, 24)}` };
}

export async function runShadow(config, options) {
  const profile = options.profile ?? "docs";
  const input = await resolveShadowInput(config, options.workItem);
  const runtime = await verifyRuntime(config);
  const skills = await verifySkills(config);
  const executionContract = await buildExecutionSpec(config, { input, profile, runtime, skills });
  const lock = await acquireWriteLock(config, `shadow:${executionContract.runId}`, {
    gitBranch: input.gitBranch,
    gitCommit: input.gitCommit,
    runId: executionContract.runId
  });

  try {
    const recorded = await runRecordedOperation(config, {
      operation: "shadow",
      expectedRevision: input.gitCommit,
      targets: ["loop-workspace"],
      rollback: "Shadow 不写业务事实；编排中断后按事务阶段显式失败终结或继续 Postcheck。",
      input: {
        runId: executionContract.runId,
        workItem: input.relative,
        profile,
        specDigest: executionContract.specDigest,
        contextDigest: executionContract.spec.contextDigest
      },
      faultAfter: options.faultAfter,
      controlledFailure: (error) => error instanceof LoopGatewayError
        && error.code === "RUN_RECOVERY_REQUIRED",
      apply: async ({ transaction }) => {
        await confirmInputUnchanged(config, input);
        const existing = await getArtifact(config, executionContract.runId);
        if (existing) {
          const status = existing.frontmatter.status;
          if (["verified", "failed"].includes(status)) {
            return {
              reused: true,
              status,
              operationOutcome: status === "verified" ? "reused" : "failed",
              receipt: {
                runId: executionContract.runId,
                status,
                reused: true,
                specDigest: executionContract.specDigest
              },
              recovery: { runId: executionContract.runId, reused: true }
            };
          }
          throw new LoopGatewayError(
            "RUN_RECOVERY_REQUIRED",
            `Run ${executionContract.runId} 处于 ${status}，拒绝自动重放`,
            { artifact: existing.path }
          );
        }

        const result = await createRunArtifacts(config, {
          input,
          profile,
          executionContract,
          transaction,
          faultStep: options.faultStep
        });
        return {
          ...result,
          operationOutcome: result.status === "verified" ? "passed" : "failed",
          transactionStatus: result.boundaryViolation ? "degraded" : "closed",
          receipt: {
            runId: executionContract.runId,
            status: result.status,
            reused: false,
            specDigest: executionContract.specDigest,
            evidenceDigest: result.evidenceDigest,
            artifactReceiptDigest: result.artifactReceiptDigest,
            boundaryViolation: result.boundaryViolation
          },
          recovery: {
            runId: executionContract.runId,
            transactionArtifact: result.transactionArtifact
          }
        };
      },
      postcheck: async (applied) => {
        if (!applied.boundaryViolation) await confirmGitStateUnchanged(config, input);
        const closure = await verifyRunClosure(config, executionContract.runId);
        const workspace = await verifyWorkspaceContract(config);
        return {
          run: closure,
          gitUnchanged: !applied.boundaryViolation,
          doctor: workspace.loopany.ok,
          auditEntries: workspace.audit.entries
        };
      }
    });

    const applied = recorded.applied;
    const status = applied.status;
    return {
      ok: status === "verified" && !applied.boundaryViolation,
      operation: "shadow",
      reused: applied.reused,
      runId: executionContract.runId,
      status,
      specDigest: executionContract.specDigest,
      transactionId: recorded.transactionId,
      transactionStatus: recorded.transactionStatus,
      boundaryViolation: Boolean(applied.boundaryViolation),
      receiptFile: recorded.receiptFile,
      receiptSha256: recorded.receiptSha256,
      runtime: summarizeRuntime(runtime),
      skills,
      commands: applied.commands ?? []
    };
  } finally {
    await lock.release();
  }
}

async function createRunArtifacts(config, context) {
  const { input, profile, executionContract, transaction, faultStep } = context;
  const runId = executionContract.runId;
  const executionId = `${runId}-exec`;
  const taskId = `${runId}-task`;
  const specId = `${runId}-spec`;
  const transactionArtifact = await createTransactionArtifact(
    config, transaction.id, "shadow", runId
  );
  await setStatus(config, transactionArtifact, "active");
  injectStep(faultStep, "transaction-artifact", transaction.id);

  await createArtifact(config, "task", taskId, {
    title: `验证 ${input.relative}`,
    status: "todo",
    priority: "medium",
    mentions: MISSION_ID
  }, [
    "## Plan",
    "",
    `按固定 ${profile} Profile 验证 [[${runId}]]，不得修改业务事实。`
  ].join("\n"));
  await createArtifact(config, "execution-spec", specId, {
    title: `${profile} execution contract`,
    "run-id": runId,
    "spec-version": executionContract.spec.specVersion,
    digest: executionContract.specDigest,
    "base-revision": input.gitCommit,
    "context-digest": executionContract.spec.contextDigest,
    "skill-digest": executionContract.spec.skill.manifestDigest,
    profile
  }, JSON.stringify(executionContract.spec, null, 2));
  await createArtifact(config, "run", runId, {
    title: `Shadow ${input.relative}`,
    status: "planned",
    profile,
    "git-commit": input.gitCommit,
    "input-hash": executionContract.specDigest,
    "work-item": input.relative
  }, `受控输入：${input.relative}\n\nExecutionSpec：[[${specId}]]`);
  injectStep(faultStep, "run-created", transaction.id);

  await createArtifact(config, "execution", executionId, {
    title: `${profile} execution`,
    status: "pending",
    profile,
    "run-id": runId,
    "started-at": new Date().toISOString()
  }, `只执行 [[${specId}]] 中登记的 pnpm Operation。`);
  await addRef(config, taskId, MISSION_ID, "advances");
  await addRef(config, runId, taskId, "implements");
  await addRef(config, specId, runId, "specifies");
  await addRef(config, executionId, runId, "executes");
  await addRef(config, transactionArtifact, runId, "tracks");
  await setStatus(config, taskId, "running");
  await setStatus(config, runId, "running");
  await setStatus(config, executionId, "running");
  injectStep(faultStep, "execution-running", transaction.id);

  const startedAt = new Date().toISOString();
  const results = await executeProfile(config, executionContract.spec, executionContract.runner);
  let boundaryError;
  try {
    await confirmGitStateUnchanged(config, input);
  } catch (error) {
    boundaryError = {
      code: error instanceof LoopGatewayError ? error.code : "WORKTREE_CHANGED_DURING_SHADOW",
      message: error instanceof Error ? error.message : String(error)
    };
  }
  const passed = !boundaryError
    && results.every((result) => result.exitCode === 0 && !result.errorCode);
  const evidencePayload = {
    schemaVersion: 1,
    runId,
    specDigest: executionContract.specDigest,
    startedAt,
    completedAt: new Date().toISOString(),
    results,
    boundaryError
  };
  const evidenceDigest = canonicalSha256(evidencePayload);
  const evidenceId = `${runId}-evidence`;
  await createArtifact(config, "evidence", evidenceId, {
    title: `${profile} command evidence`,
    "evidence-type": "command",
    "run-id": runId,
    sha256: evidenceDigest,
    source: `profile:${profile}`,
    "exit-code": results.find((item) => item.exitCode !== 0)?.exitCode ?? (boundaryError ? -1 : 0)
  }, JSON.stringify(evidencePayload, null, 2));
  await addRef(config, evidenceId, executionId, "evidences");

  const artifactReceiptPayload = {
    schemaVersion: 1,
    operation: "shadow",
    runId,
    outcome: passed ? "passed" : "failed",
    specDigest: executionContract.specDigest,
    evidenceDigest,
    commands: results.map(({ argv, exitCode, stdoutSha256, stderrSha256, errorCode }) => ({
      argv, exitCode, stdoutSha256, stderrSha256, errorCode
    })),
    boundaryError
  };
  const artifactReceiptDigest = canonicalSha256(artifactReceiptPayload);
  const receiptId = `${runId}-receipt`;
  const outcomeId = `${runId}-outcome`;
  await createArtifact(config, "outcome", outcomeId, {
    title: `${profile} verified outcome`,
    status: passed ? "passed" : "failed",
    "run-id": runId,
    "execution-id": executionId,
    "evidence-digest": evidenceDigest,
    "receipt-digest": artifactReceiptDigest,
    "completed-at": new Date().toISOString()
  }, passed
    ? `V0/V1 通过；证据 [[${evidenceId}]]，Receipt [[${receiptId}]]。`
    : `V0/V1 未通过；证据 [[${evidenceId}]]，Receipt [[${receiptId}]]。`
  );
  await createArtifact(config, "receipt", receiptId, {
    title: `${profile} shadow receipt`,
    outcome: passed ? "passed" : "failed",
    operation: "shadow",
    "run-id": runId,
    sha256: artifactReceiptDigest
  }, JSON.stringify(artifactReceiptPayload, null, 2));
  await addRef(config, outcomeId, evidenceId, "substantiated-by");
  await addRef(config, outcomeId, executionId, "evaluates");
  await addRef(config, receiptId, outcomeId, "receipts");
  await addRef(config, receiptId, runId, "receipts");
  injectStep(faultStep, "outcome-created", transaction.id);

  await setField(config, executionId, "completedAt", new Date().toISOString());
  await appendOutcome(config, executionId, passed
    ? `允许列表中的确定性命令全部通过；Outcome [[${outcomeId}]]。`
    : `至少一个 V0/V1 条件失败；Outcome [[${outcomeId}]]。`
  );
  await setStatus(config, executionId, passed ? "passed" : "failed");
  await appendOutcome(config, taskId, passed
    ? `已由 [[${outcomeId}]] 证明验收通过。`
    : `[[${outcomeId}]] 记录失败，未把部分执行写成通过。`
  );
  await setStatus(config, taskId, passed ? "done" : "failed", passed ? "V0/V1 passed" : "V0/V1 failed");
  await appendOutcome(config, runId, passed
    ? `Shadow 通过；[[${outcomeId}]] 与 [[${receiptId}]] 摘要一致。`
    : `Shadow 失败；[[${outcomeId}]] 保留证据且未修改通过结论。`
  );
  await setStatus(config, runId, passed ? "verified" : "failed");
  await appendOutcome(config, transactionArtifact, "Loop Artifact 写入已完成，等待外部事务 Postcheck。" );
  await setStatus(config, transactionArtifact, "committed");

  return {
    reused: false,
    runId,
    status: passed ? "verified" : "failed",
    transactionArtifact,
    evidenceDigest,
    artifactReceiptDigest,
    boundaryViolation: Boolean(boundaryError),
    commands: artifactReceiptPayload.commands
  };
}

export async function verifyRunClosure(config, runId) {
  const ids = {
    run: runId,
    task: `${runId}-task`,
    spec: `${runId}-spec`,
    execution: `${runId}-exec`,
    evidence: `${runId}-evidence`,
    outcome: `${runId}-outcome`,
    receipt: `${runId}-receipt`
  };
  const [run, task, specArtifact, execution, evidence, outcome, receipt] = await Promise.all([
    requireArtifact(config, ids.run, "run"),
    requireArtifact(config, ids.task, "task"),
    requireArtifact(config, ids.spec, "execution-spec"),
    requireArtifact(config, ids.execution, "execution"),
    requireArtifact(config, ids.evidence, "evidence"),
    requireArtifact(config, ids.outcome, "outcome"),
    requireArtifact(config, ids.receipt, "receipt")
  ]);
  const spec = parseJsonBody(specArtifact, "ExecutionSpec");
  const evidencePayload = parseJsonBody(evidence, "Evidence");
  const receiptPayload = parseJsonBody(receipt, "Receipt");
  const { runId: _runId, executionId: _executionId, taskId: _taskId, idempotencyKey, ...contract } = spec;
  const specDigest = canonicalSha256(contract);
  if (idempotencyKey !== specDigest || specArtifact.frontmatter.digest !== specDigest
    || run.frontmatter.inputHash !== specDigest) {
    throw new LoopGatewayError("RUN_SPEC_MISMATCH", `Run ${runId} 的 ExecutionSpec 摘要不一致`);
  }
  const evidenceDigest = canonicalSha256(evidencePayload);
  const receiptDigest = canonicalSha256(receiptPayload);
  if (evidence.frontmatter.sha256 !== evidenceDigest
    || receipt.frontmatter.sha256 !== receiptDigest
    || outcome.frontmatter.evidenceDigest !== evidenceDigest
    || outcome.frontmatter.receiptDigest !== receiptDigest
    || receiptPayload.specDigest !== specDigest
    || receiptPayload.evidenceDigest !== evidenceDigest) {
    throw new LoopGatewayError("RUN_EVIDENCE_MISMATCH", `Run ${runId} 的 Evidence/Outcome/Receipt 摘要不一致`);
  }
  const expectedPassed = run.frontmatter.status === "verified";
  const expected = expectedPassed
    ? { task: "done", execution: "passed", outcome: "passed", receipt: "passed" }
    : { task: "failed", execution: "failed", outcome: "failed", receipt: "failed" };
  if (!["verified", "failed"].includes(run.frontmatter.status)
    || task.frontmatter.status !== expected.task
    || execution.frontmatter.status !== expected.execution
    || outcome.frontmatter.status !== expected.outcome
    || receipt.frontmatter.outcome !== expected.receipt
    || !task.body.includes("## Outcome")
    || !run.body.includes("## Outcome")) {
    throw new LoopGatewayError("RUN_TERMINAL_MISMATCH", `Run ${runId} 的终态链不一致`);
  }
  const refs = await readRefs(config, runId, 3);
  const requiredEdges = [
    [ids.run, ids.task, "implements"],
    [ids.spec, ids.run, "specifies"],
    [ids.execution, ids.run, "executes"],
    [ids.evidence, ids.execution, "evidences"],
    [ids.outcome, ids.evidence, "substantiated-by"],
    [ids.outcome, ids.execution, "evaluates"],
    [ids.receipt, ids.outcome, "receipts"]
  ];
  for (const [from, to, relation] of requiredEdges) {
    if (!refs.some((edge) => edge.from === from && edge.to === to && edge.relation === relation)) {
      throw new LoopGatewayError("RUN_REFERENCE_MISSING", `Run ${runId} 缺少引用 ${from} -> ${to} (${relation})`);
    }
  }
  return {
    ok: true,
    runId,
    status: run.frontmatter.status,
    specDigest,
    evidenceDigest,
    receiptDigest,
    artifacts: Object.keys(ids).length,
    references: requiredEdges.length
  };
}

async function executeProfile(config, spec, runner) {
  const results = [];
  const env = sanitizedEnvironment({
    CI: "1",
    NODE_ENV: "test",
    NO_COLOR: "1",
    TURBO_TELEMETRY_DISABLED: "1",
    npm_execpath: runner.pnpmEntry,
    npm_node_execpath: runner.nodeExecutable
  });
  for (const operation of spec.commands) {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    try {
      const [name, script] = operation.argv;
      if (name !== "pnpm") throw new LoopGatewayError("PROFILE_COMMAND_DENIED", `未登记 Operation：${name}`);
      const result = await runProcess(runner.nodeExecutable, [runner.pnpmEntry, script], {
        cwd: config.repoRoot,
        env,
        timeoutMs: spec.budgets.maxDurationSeconds * 1000,
        outputLimit: spec.budgets.maxOutputBytes
      });
      const unexpectedError = detectUnexpectedProcessError(config, result.stderr);
      results.push({
        operationId: operation.operationId,
        argv: operation.argv,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        exitCode: result.code,
        stdoutSha256: sha256(result.stdout),
        stderrSha256: sha256(result.stderr),
        errorCode: unexpectedError ? "UNEXPECTED_PROCESS_ERROR" : undefined,
        errorPattern: unexpectedError
      });
    } catch (error) {
      results.push({
        operationId: operation.operationId,
        argv: operation.argv,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        exitCode: -1,
        stdoutSha256: sha256(""),
        stderrSha256: sha256(""),
        errorCode: error instanceof LoopGatewayError ? error.code : "PROCESS_FAILED"
      });
      break;
    }
    if (results.at(-1).exitCode !== 0 || results.at(-1).errorCode) break;
  }
  return results;
}

export function detectUnexpectedProcessError(config, stderr) {
  if (!stderr) return null;
  const patterns = config.shadowPolicy?.unexpectedErrorPatterns ?? [];
  return patterns.find((pattern) => stderr.includes(pattern)) ?? null;
}

async function confirmInputUnchanged(config, input) {
  const workItemHash = sha256(await readFile(input.absolute));
  if (workItemHash !== input.workItemHash) {
    throw new LoopGatewayError("SHADOW_INPUT_CHANGED", "Work Item 在获得写锁前后发生变化");
  }
  await confirmGitStateUnchanged(config, input);
}

async function createTransactionArtifact(config, externalId, operation, runId) {
  const slug = `tx-${externalId}`;
  const result = await createArtifact(config, "transaction", slug, {
    title: `${operation} transaction`,
    operation,
    "external-id": externalId,
    "run-id": runId
  }, "外部追加事务清单是恢复事实源；本 Artifact 提供关系入口。");
  return result.id;
}

function parseJsonBody(artifact, label) {
  try {
    return JSON.parse(artifact.body.trim());
  } catch (error) {
    throw new LoopGatewayError("RUN_BODY_INVALID", `${label} Body 不是合法 JSON：${artifact.id}`);
  }
}

function injectStep(requested, actual, transactionId) {
  if (requested === actual) throw new InjectedHardFault(`applying:${actual}`, transactionId);
}

function summarizeRuntime(runtime) {
  return {
    commit: runtime.head,
    bunVersion: runtime.bunVersion,
    cliVersion: runtime.cliVersion
  };
}
