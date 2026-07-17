import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalSha256 } from "./canonical.mjs";

/** 根据脱敏聚合 Outcome 生成只读建议；无异常时返回 null，不创建 Work Item。 */
export function generateProposal(outcome) {
  validateOutcome(outcome);
  const totals = outcome.totals;
  const taskCount = totals.tasks;
  const signals = [];
  if (totals.parseInvalid > 0) {
    signals.push(signal("parse_invalid_rate", totals.parseInvalid / taskCount, 0));
  }
  if (totals.timeout / taskCount > 0.05) {
    signals.push(signal("timeout_rate", totals.timeout / taskCount, 0.05));
  }
  if (totals.failed / taskCount > 0.1) {
    signals.push(signal("failure_rate", totals.failed / taskCount, 0.1));
  }
  if (totals.degraded / taskCount > 0.1) {
    signals.push(signal("degradation_rate", totals.degraded / taskCount, 0.1));
  }
  if (signals.length === 0) {
    return null;
  }

  const outcomeDigest = canonicalSha256(outcome);
  return {
    schemaVersion: 1,
    proposalId: `proposal-${canonicalSha256({ outcomeDigest, signals }).slice(0, 16)}`,
    mode: "proposal-only",
    release: {
      releaseId: outcome.release.releaseId,
      gitCommit: outcome.release.gitCommit,
      serverArtifactDigest: outcome.release.serverArtifactDigest
    },
    signals,
    recommendation: {
      title: "评审当前 Release 的 AI 任务质量异常",
      priority: signals.some((item) => item.name === "parse_invalid_rate") ? "P1" : "P2",
      rationale: "脱敏聚合指标超过准入阈值，建议由人工确认是否登记正式 Work Item。",
      acceptanceHints: [
        "使用确定性 Eval 复现对应异常分类",
        "修复后证明非法结构假成功率为 0",
        "由人工审批发布、回滚与 Work Item 状态变更"
      ]
    },
    evidence: { releaseOutcomeSha256: outcomeDigest },
    constraints: {
      sourceMutation: false,
      remoteGit: false,
      autoApprove: false,
      autoMerge: false,
      autoDeploy: false
    },
    decision: "human-review-required"
  };
}

export async function generateProposalFromFile(file) {
  const outcome = JSON.parse(await readFile(path.resolve(file), "utf8"));
  return generateProposal(outcome);
}

function signal(name, value, threshold) {
  return {
    name,
    value: Number(value.toFixed(6)),
    threshold,
    comparison: "greater_than"
  };
}

function validateOutcome(outcome) {
  const release = outcome?.release;
  const totals = outcome?.totals;
  const privacy = outcome?.privacy;
  const totalFields = [
    "tasks", "completed", "failed", "timeout", "cancelled",
    "parseInvalid", "degraded", "tokenTotal"
  ];
  const privacyFields = [
    "containsPrompt", "containsUserId", "containsRawResponse", "containsItineraryText"
  ];
  if (outcome?.schemaVersion !== 1
      || !release
      || typeof release.releaseId !== "string"
      || release.releaseId.length < 1
      || !/^[0-9a-f]{40,64}$/.test(release.gitCommit ?? "")
      || !/^sha256:[0-9a-f]{64}$/.test(release.serverArtifactDigest ?? "")
      || !totals
      || totalFields.some((field) => !Number.isInteger(totals[field]) || totals[field] < 0)
      || totals.tasks <= 0) {
    throw new Error("Release Outcome 身份或任务总数不合法");
  }
  const terminalTotal = totals.completed + totals.failed + totals.timeout + totals.cancelled;
  if (terminalTotal !== totals.tasks) {
    throw new Error("Release Outcome 终态合计不闭合");
  }
  if (!privacy || privacyFields.some((field) => privacy[field] !== false)) {
    throw new Error("Release Outcome 隐私边界未通过");
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href;
if (isMain) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    process.stderr.write("用法：node scripts/loop/proposal.mjs <release-outcome.json>\n");
    process.exitCode = 2;
  } else {
    generateProposalFromFile(file)
      .then((proposal) => process.stdout.write(`${JSON.stringify(proposal, null, 2)}\n`))
      .catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      });
  }
}
