import assert from "node:assert/strict";
import test from "node:test";

import {
  createAutomationPullRequest,
  validateAuthorInputs,
} from "../github/automation-pr-author.mjs";
import {
  validateAutomationAuthorWorkflow,
  validateWorkflowText,
} from "../public-readiness.mjs";

const validEnvironment = {
  GH_TOKEN: "test-only-token",
  REPOSITORY: "cyhui555/deeptrail-open",
  REPOSITORY_OWNER: "cyhui555",
  WORKFLOW_ACTOR: "cyhui555",
  WORKFLOW_RUN_ID: "12345",
  SOURCE_REF: "agent/l2-cohort-ledger",
  EXPECTED_SHA: "a".repeat(40),
  TARGET_BRANCH: "automation/l2-cohort-ledger",
  PR_TITLE: "固化 L2 Cohort 门禁",
  PR_BODY: "由自动化账号创建，等待唯一人工维护者审核。",
};

test("自动化作者只接受固定仓库、所有者和受限分支", () => {
  const actual = validateAuthorInputs(validEnvironment);
  assert.equal(actual.sourceRef, "agent/l2-cohort-ledger");
  assert.equal(actual.targetBranch, "automation/l2-cohort-ledger");
});

test("自动化作者拒绝仓库、触发者与分支越界", () => {
  for (const patch of [
    { REPOSITORY: "someone/else" },
    { WORKFLOW_ACTOR: "someone-else" },
    { SOURCE_REF: "main" },
    { SOURCE_REF: "agent/../main" },
    { TARGET_BRANCH: "agent/not-automation" },
    { TARGET_BRANCH: "automation/bad.lock" },
  ]) {
    assert.throws(() => validateAuthorInputs({ ...validEnvironment, ...patch }));
  }
});

test("自动化作者拒绝漂移 SHA 与控制字符", () => {
  assert.throws(() => validateAuthorInputs({ ...validEnvironment, EXPECTED_SHA: "abc" }));
  assert.throws(() => validateAuthorInputs({ ...validEnvironment, PR_TITLE: "bad\u0000title" }));
});

test("自动化作者按锁定 SHA 创建 Draft PR 并保留人工 CI 门禁", async () => {
  const calls = [];
  const request = async (method, pathname, options) => {
    calls.push({ method, pathname, body: options.body });
    if (method === "GET" && pathname.includes("/git/refs/heads/agent/")) {
      return { object: { sha: validEnvironment.EXPECTED_SHA } };
    }
    if (method === "GET" && pathname.includes("/compare/")) {
      return { status: "ahead", ahead_by: 2, behind_by: 0 };
    }
    if (method === "GET" && pathname.includes("/git/refs/heads/automation/")) return undefined;
    if (method === "POST" && pathname.endsWith("/pulls")) {
      return {
        html_url: "https://github.com/cyhui555/deeptrail-open/pull/100",
        number: 100,
        user: { login: "github-actions[bot]" },
      };
    }
    return undefined;
  };

  const result = await createAutomationPullRequest(validEnvironment, request);
  assert.equal(result.author, "github-actions[bot]");
  assert.deepEqual(calls.map(({ method, pathname }) => `${method} ${pathname}`), [
    "GET /repos/cyhui555/deeptrail-open/git/refs/heads/agent/l2-cohort-ledger",
    `GET /repos/cyhui555/deeptrail-open/compare/main...${validEnvironment.EXPECTED_SHA}`,
    "GET /repos/cyhui555/deeptrail-open/git/refs/heads/automation/l2-cohort-ledger",
    "POST /repos/cyhui555/deeptrail-open/git/refs",
    "POST /repos/cyhui555/deeptrail-open/pulls",
  ]);
  assert.equal(result.ciDispatched, false);
});

test("PR 创建失败时只清理本次新建的自动化分支", async () => {
  const calls = [];
  const request = async (method, pathname, options) => {
    calls.push(`${method} ${pathname}`);
    if (method === "GET" && pathname.includes("/git/refs/heads/agent/")) {
      return { object: { sha: validEnvironment.EXPECTED_SHA } };
    }
    if (method === "GET" && pathname.includes("/compare/")) {
      return { status: "ahead", ahead_by: 1, behind_by: 0 };
    }
    if (method === "GET") return undefined;
    if (method === "POST" && pathname.endsWith("/pulls")) throw new Error("creation denied");
    return options;
  };

  await assert.rejects(() => createAutomationPullRequest(validEnvironment, request), /creation denied/);
  assert.equal(calls.at(-1),
    "DELETE /repos/cyhui555/deeptrail-open/git/refs/heads/automation/l2-cohort-ledger");
});

test("仅固定手工自动化作者工作流可以声明最小写权限", () => {
  const workflow = [
    "name: Automation PR author",
    "",
    "on:",
    "  workflow_dispatch:",
    "",
    "permissions: {}",
    "",
    "jobs:",
    "  promote:",
    "    if: github.actor == github.repository_owner && github.ref == 'refs/heads/main' && github.repository == 'cyhui555/deeptrail-open'",
    "    permissions:",
    "      contents: write",
    "      pull-requests: write",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Run",
    "        env:",
    "          GH_TOKEN: ${{ github.token }}",
    "        run: node scripts/github/automation-pr-author.mjs",
  ].join("\n");
  assert.deepEqual(validateAutomationAuthorWorkflow(workflow), []);
  assert.deepEqual(validateWorkflowText(workflow, ".github/workflows/automation-pr-author.yml"), []);
  assert.deepEqual(validateWorkflowText(workflow, ".github/workflows/untrusted.yml"), [
    "workflow-permissions-not-read-only",
  ]);
  assert.ok(validateAutomationAuthorWorkflow(`${workflow}\non:\n  repository_dispatch:\n`)
    .includes("author-workflow-trigger-too-broad"));
});
