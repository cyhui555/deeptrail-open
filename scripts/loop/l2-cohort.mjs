import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { requireArtifact } from "./artifacts.mjs";
import { canonicalJson } from "./canonical.mjs";
import { resolveGatewayConfig } from "./config.mjs";
import { LoopGatewayError, formatError } from "./errors.mjs";
import { recoverLoop } from "./operations.mjs";
import { verifyReceiptSet } from "./receipt-integrity.mjs";
import { verifyRunClosure } from "./shadow.mjs";
import { verifyWorkspaceContract } from "./workspace-check.mjs";

const execFileAsync = promisify(execFile);
const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const manifestFile = path.join(moduleRoot, "l2-cohort.json");
const configFile = path.join(moduleRoot, "loop.config.json");
const expectedRepository = "cyhui555/deeptrail-open";
const fixedThresholds = Object.freeze({
  firstVerificationSuccessRate: 0.9,
  idempotentReuseSuccessRate: 1,
  closureRate: 1,
  boundaryViolationRate: 0,
  lastConsecutivePasses: 5
});
const fixedSelectionPolicy = Object.freeze({
  unit: "work-item",
  initialTranche: "all-active-non-coordinator-work-items-at-base-revision",
  futureRegistration: "append-on-protected-main-before-first-shadow",
  evidenceBinding: "append-after-registration-is-on-main",
  failureRetention: "never-remove-reorder-or-replace"
});
const coordinatorWorkItem = "docs/issues/task-loop-003-l1-phase2-to-l2.md";
const workItemPattern = /^docs\/issues\/(?:task|bug|spike)-[a-z0-9-]+\.md$/i;
const runIdPattern = /^run-[a-f0-9]{24}$/;

export function validateManifestShape(manifest, previous = undefined) {
  assert(manifest && typeof manifest === "object" && !Array.isArray(manifest),
    "L2_COHORT_INVALID", "L2 Cohort 必须是 JSON Object");
  assert(manifest.schemaVersion === 1, "L2_COHORT_INVALID", "仅支持 L2 Cohort Schema 1");
  assert(typeof manifest.cohortId === "string" && /^l2-[a-z0-9-]+$/.test(manifest.cohortId),
    "L2_COHORT_INVALID", "cohortId 不合法");
  assert(manifest.repository === expectedRepository,
    "L2_COHORT_REPOSITORY_DRIFT", `L2 Cohort 只能绑定 ${expectedRepository}`);
  assert(/^[a-f0-9]{40}$/.test(manifest.baseRevision),
    "L2_COHORT_INVALID", "baseRevision 必须是完整 Git Commit");
  assert(manifest.targetWorkItems === 10,
    "L2_COHORT_THRESHOLD_DRIFT", "L2 最小样本数必须固定为 10 个 Work Item");
  assert(canonicalJson(manifest.thresholds) === canonicalJson(fixedThresholds),
    "L2_COHORT_THRESHOLD_DRIFT", "L2 验收阈值不得放宽或改写");
  assert(canonicalJson(manifest.selectionPolicy) === canonicalJson(fixedSelectionPolicy),
    "L2_COHORT_POLICY_DRIFT", "L2 样本选择与失败保留策略不得改写");
  assert(Array.isArray(manifest.exclusions) && manifest.exclusions.length === 1
      && manifest.exclusions[0]?.workItem === coordinatorWorkItem
      && manifest.exclusions[0]?.reason === "cohort-coordinator-cannot-score-itself",
    "L2_COHORT_EXCLUSION_DRIFT", "只允许排除不能自评分的 L2 协调 Work Item");
  assert(Array.isArray(manifest.registrations) && manifest.registrations.length > 0,
    "L2_COHORT_INVALID", "L2 Cohort 至少需要一个登记样本");
  assert(Array.isArray(manifest.evidence), "L2_COHORT_INVALID", "evidence 必须是数组");

  const workItems = new Set();
  const runIds = new Set();
  const registrationBySequence = new Map();
  manifest.registrations.forEach((registration, index) => {
    assert(registration?.sequence === index + 1,
      "L2_COHORT_SEQUENCE_DRIFT", "样本 sequence 必须从 1 连续递增");
    assert(typeof registration.workItem === "string" && workItemPattern.test(registration.workItem)
        && registration.workItem !== coordinatorWorkItem,
      "L2_COHORT_INVALID", `非法或不可自评分的 Work Item：${registration.workItem}`);
    assert(!workItems.has(registration.workItem),
      "L2_COHORT_DUPLICATE", `Work Item 重复登记：${registration.workItem}`);
    assert(Array.isArray(registration.profiles) && registration.profiles.length > 0
        && registration.profiles.every((profile) => typeof profile === "string")
        && new Set(registration.profiles).size === registration.profiles.length,
      "L2_COHORT_INVALID", `Work Item Profile 不合法：${registration.workItem}`);
    workItems.add(registration.workItem);
    registrationBySequence.set(registration.sequence, registration);
  });

  const evidenceSequences = new Set();
  manifest.evidence.forEach((item) => {
    const registration = registrationBySequence.get(item?.registrationSequence);
    assert(registration && !evidenceSequences.has(item.registrationSequence),
      "L2_COHORT_EVIDENCE_INVALID", `Evidence 登记不存在或重复：${item?.registrationSequence}`);
    assert(Array.isArray(item.runs) && item.runs.length === registration.profiles.length,
      "L2_COHORT_EVIDENCE_INVALID", `Evidence 未覆盖全部 Profile：${registration.workItem}`);
    assert(canonicalJson(item.runs.map(({ profile }) => profile))
        === canonicalJson(registration.profiles),
      "L2_COHORT_EVIDENCE_INVALID", `Evidence Profile 顺序或集合不一致：${registration.workItem}`);
    for (const run of item.runs) {
      assert(run && runIdPattern.test(run.runId) && !runIds.has(run.runId),
        "L2_COHORT_EVIDENCE_INVALID", `Run ID 非法或重复：${run?.runId}`);
      runIds.add(run.runId);
    }
    evidenceSequences.add(item.registrationSequence);
  });

  if (previous) validateAppendOnly(manifest, previous);
  return manifest;
}

export function evaluateCohort(registrations, thresholds = fixedThresholds, targetWorkItems = 10) {
  assert(Array.isArray(registrations) && registrations.length > 0,
    "L2_COHORT_EMPTY", "没有可评估的 L2 Work Item");
  const entries = registrations.map((registration) => {
    const profiles = Array.isArray(registration.profileResults)
      ? registration.profileResults
      : [];
    const complete = profiles.length === registration.profiles.length
      && registration.profiles.every((profile) =>
        profiles.some((result) => result.profile === profile && !result.missingEvidence));
    const firstVerified = complete
      && profiles.every((result) => result.firstStatus === "verified" && result.firstReused === false);
    const reuseVerified = complete && profiles.every((result) =>
      result.repeatedReused === true && result.repeatedStatus === result.firstStatus);
    const closureVerified = complete && profiles.every((result) =>
      result.closureOk === true && ["verified", "failed"].includes(result.firstStatus));
    const boundaryViolation = profiles.some((result) => result.boundaryViolation === true);
    const continuousPass = firstVerified && reuseVerified && closureVerified && !boundaryViolation;
    return {
      sequence: registration.sequence,
      workItem: registration.workItem,
      profiles,
      complete,
      firstVerified,
      reuseVerified,
      closureVerified,
      boundaryViolation,
      continuousPass
    };
  });

  const total = entries.length;
  const firstVerified = entries.filter((entry) => entry.firstVerified).length;
  const reuseVerified = entries.filter((entry) => entry.reuseVerified).length;
  const closureVerified = entries.filter((entry) => entry.closureVerified).length;
  const boundaryViolations = entries.filter((entry) => entry.boundaryViolation).length;
  let lastConsecutivePasses = 0;
  for (const entry of entries.toReversed()) {
    if (!entry.continuousPass) break;
    lastConsecutivePasses += 1;
  }
  const metrics = {
    firstVerificationSuccessRate: firstVerified / total,
    idempotentReuseSuccessRate: reuseVerified / total,
    closureRate: closureVerified / total,
    boundaryViolationRate: boundaryViolations / total,
    lastConsecutivePasses
  };
  const targetMet = total >= targetWorkItems;
  const thresholdsMet = metrics.firstVerificationSuccessRate
      >= thresholds.firstVerificationSuccessRate
    && metrics.idempotentReuseSuccessRate >= thresholds.idempotentReuseSuccessRate
    && metrics.closureRate >= thresholds.closureRate
    && metrics.boundaryViolationRate <= thresholds.boundaryViolationRate
    && metrics.lastConsecutivePasses >= thresholds.lastConsecutivePasses;
  return {
    workItemCount: total,
    profileRunCount: entries.reduce((sum, entry) => sum + entry.profiles.length, 0),
    targetWorkItems,
    targetMet,
    thresholdsMet,
    cohortReady: targetMet && thresholdsMet,
    metrics,
    entries
  };
}

export async function verifyStaticCohort(manifest, repoRoot = process.cwd()) {
  const previous = await readPreviousManifest(repoRoot);
  validateManifestShape(manifest, previous);
  const loopConfig = JSON.parse(await readFile(configFile, "utf8"));
  const supportedProfiles = new Set(Object.keys(loopConfig.profiles ?? {}));
  for (const registration of manifest.registrations) {
    for (const profile of registration.profiles) {
      assert(supportedProfiles.has(profile), "L2_COHORT_PROFILE_UNKNOWN",
        `未登记的 Shadow Profile：${profile}`);
    }
    assert(await gitSucceeds(repoRoot, ["ls-files", "--error-unmatch", "--", registration.workItem]),
      "L2_COHORT_WORK_ITEM_UNTRACKED", `Work Item 未被 Git 跟踪：${registration.workItem}`);
  }
  assert(await gitSucceeds(repoRoot, ["merge-base", "--is-ancestor", manifest.baseRevision, "HEAD"]),
    "L2_COHORT_BASE_INVALID", "L2 baseRevision 不是当前 Revision 的祖先");

  const origin = (await gitOptional(repoRoot, ["config", "--get", "remote.origin.url"]))?.trim();
  if (origin) {
    assert(normalizeGitHubRepository(origin) === manifest.repository,
      "L2_COHORT_REMOTE_MISMATCH", `origin 不是 ${manifest.repository}`);
  }

  // 初始批次是基线 Revision 上除协调项外的全部 Work Item，以证明没有事后挑选成功样本。
  const baselineFiles = (await gitRequired(repoRoot, [
    "ls-tree", "-r", "--name-only", manifest.baseRevision, "--", "docs/issues"
  ], "读取 L2 基线 Work Item")).split(/\r?\n/).filter(Boolean);
  const exclusions = new Set(manifest.exclusions.map(({ workItem }) => workItem));
  const baselineWorkItems = baselineFiles.filter((file) => workItemPattern.test(file)
    && !exclusions.has(file)).sort();
  const initialRegistrations = manifest.registrations
    .slice(0, baselineWorkItems.length).map(({ workItem }) => workItem).sort();
  assert(baselineWorkItems.length > 0
      && canonicalJson(initialRegistrations) === canonicalJson(baselineWorkItems),
    "L2_COHORT_INITIAL_SELECTION_DRIFT",
    "初始批次必须完整覆盖基线 Revision 上除协调项外的全部 Work Item");
  return {
    ok: true,
    previousManifestFound: Boolean(previous),
    registrations: manifest.registrations.length,
    evidenceBindings: manifest.evidence.length,
    baseRevision: manifest.baseRevision,
    remote: origin ? manifest.repository : "sanitized-copy-without-origin"
  };
}

export async function verifyRuntimeCohort(config, manifest) {
  const receiptIntegrity = await verifyReceiptSet(config);
  const receipts = receiptIntegrity.documents;
  const shadowReceipts = receipts.filter((receipt) => receipt.operation === "shadow"
    && typeof receipt.result?.runId === "string");
  const evidenceBySequence = new Map(manifest.evidence
    .map((item) => [item.registrationSequence, item]));
  const registrations = [];

  for (const registration of manifest.registrations) {
    const evidence = evidenceBySequence.get(registration.sequence);
    const profileResults = [];
    if (evidence) {
      for (const run of evidence.runs) {
        profileResults.push(await verifyProfileRun(
          config, manifest, registration, run, shadowReceipts
        ));
      }
    }
    registrations.push({ ...registration, profileResults });
  }

  const workspace = await verifyWorkspaceContract(config);
  const recovery = await recoverLoop(config);
  assert(recovery.ok, "L2_COHORT_RECOVERY_REQUIRED", "Loop Workspace 存在残留锁或未终结事务");
  const evaluation = evaluateCohort(
    registrations, manifest.thresholds, manifest.targetWorkItems
  );
  return {
    schemaVersion: 1,
    cohortId: manifest.cohortId,
    repository: manifest.repository,
    baseRevision: manifest.baseRevision,
    integrity: {
      receiptsVerified: receiptIntegrity.total,
      v2ReceiptsVerified: receiptIntegrity.v2Verified,
      legacyReceiptsAttested: receiptIntegrity.legacyAttested,
      unattestedLegacyReceipts: receiptIntegrity.unattestedLegacy,
      legacyReceiptPolicy: receiptIntegrity.policyId,
      doctorOk: workspace.ok,
      recoveryOk: recovery.ok,
      remoteGitWrite: workspace.capabilities.remoteGitWrite,
      mutationEnabled: false
    },
    ...evaluation
  };
}

async function verifyProfileRun(config, manifest, registration, run, shadowReceipts) {
  const matching = shadowReceipts.filter((receipt) => receipt.result.runId === run.runId);
  const first = matching.filter((receipt) => receipt.result.reused === false);
  const repeated = matching.filter((receipt) => receipt.result.reused === true);
  assert(first.length === 1 && repeated.length >= 1,
    "L2_COHORT_REUSE_EVIDENCE_MISSING",
    `${run.runId} 必须有且仅有一次首次执行，并至少有一次幂等复用`);
  const firstReceipt = first[0];
  assert(repeated.every((receipt) => receipt.recordedAt >= firstReceipt.recordedAt),
    "L2_COHORT_RECEIPT_ORDER_INVALID", `${run.runId} 的复用 Receipt 早于首次执行`);
  assert(["verified", "failed"].includes(firstReceipt.result.status)
      && repeated.every((receipt) => receipt.result.status === firstReceipt.result.status),
    "L2_COHORT_STATUS_DRIFT", `${run.runId} 首次与复用终态不一致`);
  assert(matching.every((receipt) => receipt.verification?.run?.ok === true
      && receipt.verification.run.runId === run.runId
      && receipt.verification.gitUnchanged === true),
    "L2_COHORT_RECEIPT_UNVERIFIED", `${run.runId} Receipt 的闭环或 Git 边界未通过`);

  const closure = await verifyRunClosure(config, run.runId);
  const [runArtifact, specArtifact] = await Promise.all([
    requireArtifact(config, run.runId, "run"),
    requireArtifact(config, `${run.runId}-spec`, "execution-spec")
  ]);
  const spec = parseArtifactBody(specArtifact, "ExecutionSpec");
  assert(runArtifact.frontmatter.workItem === registration.workItem
      && runArtifact.frontmatter.profile === run.profile
      && spec.profile === run.profile
      && spec.inputs?.length === 1
      && spec.inputs[0]?.path === registration.workItem,
    "L2_COHORT_RUN_BINDING_MISMATCH", `${run.runId} 与登记的 Work Item/Profile 不一致`);
  assert(spec.baseRevision === runArtifact.frontmatter.gitCommit
      && specArtifact.frontmatter.baseRevision === spec.baseRevision
      && await gitSucceeds(config.repoRoot, [
        "merge-base", "--is-ancestor", manifest.baseRevision, spec.baseRevision
      ]),
    "L2_COHORT_RUN_REVISION_INVALID", `${run.runId} 不属于 L2 基线之后的 Revision`);
  assert(spec.mutationPermissions?.enabled === false
      && spec.mutationPermissions?.remoteGitWrite === false
      && spec.budgets?.maxBusinessFileMutations === 0,
    "L2_COHORT_BOUNDARY_VIOLATION", `${run.runId} 启用了 L2 禁止的写能力`);
  assert(closure.status === firstReceipt.result.status
      && matching.every((receipt) => receipt.result.specDigest === closure.specDigest),
    "L2_COHORT_CLOSURE_MISMATCH", `${run.runId} Receipt 与 Artifact 闭环不一致`);
  const boundaryViolation = matching.some((receipt) =>
    receipt.result.boundaryViolation === true || receipt.verification.gitUnchanged !== true);
  return {
    profile: run.profile,
    runId: run.runId,
    firstStatus: firstReceipt.result.status,
    firstReused: firstReceipt.result.reused,
    repeatedStatus: repeated.at(-1).result.status,
    repeatedReused: repeated.every((receipt) => receipt.result.reused === true),
    closureOk: closure.ok,
    boundaryViolation
  };
}

function validateAppendOnly(manifest, previous) {
  validateManifestShape(previous);
  const stableFields = [
    "schemaVersion", "cohortId", "repository", "baseRevision", "targetWorkItems",
    "thresholds", "selectionPolicy", "exclusions"
  ];
  for (const field of stableFields) {
    assert(canonicalJson(manifest[field]) === canonicalJson(previous[field]),
      "L2_COHORT_CONTRACT_MUTATED", `已发布的 L2 合同字段不得修改：${field}`);
  }
  assert(manifest.registrations.length >= previous.registrations.length
      && manifest.evidence.length >= previous.evidence.length,
    "L2_COHORT_HISTORY_REMOVED", "已发布的登记或 Evidence 不得删除");
  assert(canonicalJson(manifest.registrations.slice(0, previous.registrations.length))
      === canonicalJson(previous.registrations)
      && canonicalJson(manifest.evidence.slice(0, previous.evidence.length))
      === canonicalJson(previous.evidence),
    "L2_COHORT_HISTORY_MUTATED", "已发布的登记或 Evidence 不得重排、替换或修改");
  for (const item of manifest.evidence.slice(previous.evidence.length)) {
    assert(item.registrationSequence <= previous.registrations.length,
      "L2_COHORT_NOT_PREREGISTERED",
      `Evidence ${item.registrationSequence} 对应样本尚未先行登记到 main`);
  }
}

async function readPreviousManifest(repoRoot) {
  const content = await gitOptional(repoRoot, ["show", "origin/main:scripts/loop/l2-cohort.json"]);
  if (!content) return undefined;
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new LoopGatewayError(
      "L2_COHORT_PREVIOUS_INVALID", `origin/main 的 L2 Cohort 不是合法 JSON：${error.message}`
    );
  }
}

function normalizeGitHubRepository(remote) {
  return remote.trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "");
}

async function gitRequired(repoRoot, args, label) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });
    return stdout;
  } catch (error) {
    throw new LoopGatewayError("L2_COHORT_GIT_FAILED", `${label}失败`, {
      args,
      stderr: String(error?.stderr ?? "").trim().slice(0, 4096)
    });
  }
}

async function gitOptional(repoRoot, args) {
  try {
    return await gitRequired(repoRoot, args, "执行可选 Git 检查");
  } catch (error) {
    if (error instanceof LoopGatewayError && error.code === "L2_COHORT_GIT_FAILED") return undefined;
    throw error;
  }
}

async function gitSucceeds(repoRoot, args) {
  try {
    await execFileAsync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

function parseArtifactBody(artifact, label) {
  try {
    return JSON.parse(artifact.body.trim());
  } catch (error) {
    throw new LoopGatewayError(
      "L2_COHORT_ARTIFACT_INVALID", `${label} Body 不是合法 JSON：${artifact.id}`
    );
  }
}

function assert(condition, code, message) {
  if (!condition) throw new LoopGatewayError(code, message);
}

async function loadManifest() {
  return JSON.parse(await readFile(manifestFile, "utf8"));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(["--static", "--strict"]);
  assert([...args].every((argument) => allowed.has(argument)),
    "L2_COHORT_ARGUMENT_DENIED", "只允许 --static 与 --strict 参数");
  const manifest = await loadManifest();
  const repoRoot = (await gitRequired(process.cwd(), ["rev-parse", "--show-toplevel"],
    "定位 Git 根目录")).trim();
  const staticResult = await verifyStaticCohort(manifest, repoRoot);
  if (args.has("--static")) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, staticOnly: true, ...staticResult }, null, 2)}\n`);
    return;
  }
  const config = await resolveGatewayConfig({ repoRoot });
  const report = await verifyRuntimeCohort(config, manifest);
  process.stdout.write(`${JSON.stringify({ ...report, static: staticResult }, null, 2)}\n`);
  if (args.has("--strict") && !report.cohortReady) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(formatError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
