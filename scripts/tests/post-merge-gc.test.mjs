import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyPostMergePlan,
  buildPostMergePlan,
  parseAuditSource,
  parsePostMergeGcArgs,
} from "../git/post-merge-gc.mjs";

const headSha = "a".repeat(40);
const mainSha = "b".repeat(40);
const mergeSha = "c".repeat(40);
const targetBranch = "automation/task-git-001-post-merge-gc";
const sourceBranch = "agent/task-git-001-post-merge-gc";

test("参数默认 dry-run，apply 必须显式绑定完整 head", () => {
  const dryRun = parsePostMergeGcArgs(["--", "--pr", "54"]);
  assert.equal(dryRun.apply, false);
  assert.equal(dryRun.minAgeHours, 24);
  assert.equal(dryRun.expectedHead, null);

  assert.throws(() => parsePostMergeGcArgs(["--pr", "54", "--apply"]), /expected-head/);
  assert.throws(() => parsePostMergeGcArgs(["--pr", "54", "--remove-worktrees"]));
  assert.throws(() => parsePostMergeGcArgs(["--pr", "54", "--include-alias", "main"]));

  const apply = parsePostMergeGcArgs([
    "--pr", "54", "--expected-head", headSha, "--min-age-hours", "0", "--apply",
  ]);
  assert.equal(apply.apply, true);
  assert.equal(apply.expectedHead, headSha);
  assert.equal(apply.minAgeHours, 0);
});

test("审计 Source 只接受唯一 agent 分支与精确 PR head", () => {
  const body = `说明\n\n- Source: \`${sourceBranch}@${headSha}\``;
  assert.deepEqual(parseAuditSource(body, headSha), { branch: sourceBranch, sha: headSha });
  assert.equal(parseAuditSource(body, "d".repeat(40)), null);
  assert.equal(parseAuditSource(`- Source: \`bug/task@${headSha}\``, headSha), null);
  assert.equal(parseAuditSource(`${body}\n${body}`, headSha), null);
});

test("dry-run 只计划 PR head 与审计 Source，同 SHA 未授权别名只报告", () => {
  const options = validOptions({ apply: false });
  const plan = buildPostMergePlan(baseFacts(), options, new Date("2026-07-20T12:00:00Z"));

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.writesPerformed, false);
  assert.equal(plan.readyForApply, true);
  assert.deepEqual(plan.candidates.map(({ branch }) => branch), [targetBranch, sourceBranch]);
  assert.deepEqual(plan.sameShaAliases, [
    { branch: "bug/task-git-001-post-merge-gc", disposition: "manual-review" },
  ]);
  assert.deepEqual(plan.actions.map(({ type, branch }) => `${type}:${branch}`), [
    `delete-local-branch:${sourceBranch}`,
    `delete-remote-branch:${sourceBranch}`,
    `delete-remote-branch:${targetBranch}`,
  ]);
});

test("显式别名只有在 SHA 精确一致且无 Open PR 时才进入计划", () => {
  const alias = "bug/task-git-001-post-merge-gc";
  const options = validOptions({ includeAliases: [alias] });
  const eligible = buildPostMergePlan(baseFacts(), options, new Date("2026-07-20T12:00:00Z"));
  assert.equal(eligible.candidates.find(({ branch }) => branch === alias).disposition, "eligible");

  const drifted = baseFacts();
  drifted.remoteHeads[alias] = "d".repeat(40);
  const blocked = buildPostMergePlan(drifted, options, new Date("2026-07-20T12:00:00Z"));
  assert.equal(blocked.candidates.find(({ branch }) => branch === alias).disposition, "blocked");
  assert.equal(blocked.readyForApply, false);
});

test("OPEN PR、dirty/current worktree、未批准移除与保留期均失败关闭", () => {
  const open = baseFacts();
  open.openPullRequests[sourceBranch] = [{ number: 99, url: "https://example.test/99" }];
  assert.equal(buildPostMergePlan(open, validOptions(), new Date("2026-07-20T12:00:00Z"))
    .candidates.find(({ branch }) => branch === sourceBranch).disposition, "blocked");

  for (const worktree of [
    { dirty: true, current: false },
    { dirty: false, current: true },
  ]) {
    const facts = baseFacts();
    facts.worktrees.push({
      path: "C:/tmp/task-git-001", branch: sourceBranch, head: headSha, ...worktree,
    });
    const plan = buildPostMergePlan(facts, validOptions({ removeWorktrees: true }),
      new Date("2026-07-20T12:00:00Z"));
    assert.equal(plan.candidates.find(({ branch }) => branch === sourceBranch).disposition, "blocked");
  }

  const occupied = baseFacts();
  occupied.worktrees.push({
    path: "C:/tmp/task-git-001", branch: sourceBranch, head: headSha, dirty: false, current: false,
  });
  const noApproval = buildPostMergePlan(occupied, validOptions(), new Date("2026-07-20T12:00:00Z"));
  assert.ok(noApproval.candidates.find(({ branch }) => branch === sourceBranch)
    .blockers.some(({ code }) => code === "worktree-removal-not-approved"));

  const young = buildPostMergePlan(baseFacts(), validOptions(), new Date("2026-07-19T01:00:00Z"));
  assert.ok(young.blockers.some(({ code }) => code === "retention-window"));
  assert.equal(young.readyForApply, false);
});

test("squash merge 只依赖已验证 PR head 与 merge 可达事实", () => {
  const facts = baseFacts();
  facts.localBranches[sourceBranch] = headSha;
  const plan = buildPostMergePlan(facts, validOptions(), new Date("2026-07-20T12:00:00Z"));
  assert.equal(plan.pullRequest.headSha, headSha);
  assert.equal(plan.pullRequest.mergeCommit, mergeSha);
  assert.equal(plan.readyForApply, true);
});

test("apply 按 worktree、本地分支、远端分支顺序执行并写 JSONL Receipt", async () => {
  const receiptRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-gc-test-"));
  try {
    const calls = [];
    const run = async (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "rev-parse" || args[0] === "show-ref") {
        return { code: 0, stdout: `${headSha}\n`, stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    };
    const plan = {
      ...buildPostMergePlan(baseFactsWithCleanWorktree(),
        validOptions({ apply: true, removeWorktrees: true }), new Date("2026-07-20T12:00:00Z")),
      mode: "apply",
    };
    const result = await applyPostMergePlan(plan, { run, receiptRoot });
    assert.equal(result.ok, true);
    const mutations = calls.map(([, ...args]) => args).filter((args) =>
      (args[0] === "worktree" && args[1] === "remove")
      || args[0] === "branch" || args[0] === "push");
    assert.deepEqual(mutations.map(([command]) => command), [
      "worktree", "branch", "push", "push",
    ]);
    const events = (await readFile(result.receiptPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(events[0].phase, "prepared");
    assert.equal(events.at(-1).phase, "completed");
    assert.equal(events.filter(({ phase }) => phase === "action").length, 4);
  } finally {
    await rm(receiptRoot, { recursive: true, force: true });
  }
});

test("apply 单项失败后跳过同分支后续动作并保留 partial Receipt", async () => {
  const receiptRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-gc-test-"));
  try {
    const run = async (_command, args) => {
      if (args[0] === "show-ref") return { code: 0, stdout: `${headSha}\n`, stderr: "" };
      return {
        code: args[0] === "branch" ? 1 : 0,
        stdout: "",
        stderr: "test failure",
      };
    };
    const plan = {
      ...buildPostMergePlan(baseFacts(), validOptions({ apply: true }),
        new Date("2026-07-20T12:00:00Z")),
      mode: "apply",
    };
    const result = await applyPostMergePlan(plan, { run, receiptRoot });
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "partial");
    assert.ok(result.results.some(({ status }) => status === "failed"));
    assert.ok(result.results.some(({ status }) => status === "skipped"));
  } finally {
    await rm(receiptRoot, { recursive: true, force: true });
  }
});

function validOptions(patch = {}) {
  return {
    pullRequest: 54,
    expectedHead: headSha,
    apply: false,
    removeWorktrees: false,
    includeAliases: [],
    minAgeHours: 24,
    ...patch,
  };
}

function baseFacts() {
  return {
    repository: "cyhui555/deeptrail-open",
    repositoryRoot: "C:/repo",
    gitCommonDir: "C:/repo/.git",
    pullRequest: {
      number: 54,
      state: "MERGED",
      draft: false,
      mergedAt: "2026-07-18T12:00:00Z",
      headBranch: targetBranch,
      headSha,
      baseBranch: "main",
      mergeCommit: mergeSha,
      url: "https://github.com/cyhui555/deeptrail-open/pull/54",
      closingIssues: [{ number: 54, state: "OPEN", url: "https://example.test/54" }],
    },
    auditSource: { branch: sourceBranch, sha: headSha },
    remoteHeads: {
      main: mainSha,
      [targetBranch]: headSha,
      [sourceBranch]: headSha,
      "bug/task-git-001-post-merge-gc": headSha,
    },
    localBranches: { [sourceBranch]: headSha },
    worktrees: [],
    openPullRequests: { [targetBranch]: [], [sourceBranch]: [] },
    invocation: {
      clean: true,
      head: mainSha,
      originMain: mainSha,
      remoteMain: mainSha,
      mergeReachable: true,
    },
  };
}

function baseFactsWithCleanWorktree() {
  const facts = baseFacts();
  facts.worktrees.push({
    path: "C:/tmp/task-git-001",
    branch: sourceBranch,
    head: headSha,
    dirty: false,
    current: false,
  });
  return facts;
}
