import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  finalizeArchivePullRequest,
  validateArchiveFiles,
  validateFinalizerInputs,
} from "../github/archive-pr-finalizer.mjs";
import {
  validateArchiveFinalizerWorkflow,
  validateWorkflowText,
} from "../public-readiness.mjs";

const head = "b".repeat(40);
const stem = "bug-20260719-001-poi-coordinate-refresh";
const validEnvironment = {
  GH_TOKEN: "test-only-token",
  REPOSITORY: "cyhui555/deeptrail-open",
  WORKFLOW_RUN_ID: "24680",
  EXPECTED_HEAD_SHA: head,
};
const requiredChecks = [
  "Governance and Loop quality",
  "Backend quality",
  "Backend E2E",
  "Frontend quality and Eval",
  "Frontend smoke",
];

test("归档 Finalizer 只接受固定仓库、Run ID 与完整 Head", () => {
  assert.equal(validateFinalizerInputs(validEnvironment).expectedHeadSha, head);
  for (const patch of [
    { REPOSITORY: "someone/else" },
    { WORKFLOW_RUN_ID: "not-a-number" },
    { EXPECTED_HEAD_SHA: "abc" },
  ]) {
    assert.throws(() => validateFinalizerInputs({ ...validEnvironment, ...patch }));
  }
});

test("严格归档差异接受同名摘要、删除项与受控索引", () => {
  assert.deepEqual(validateArchiveFiles(validFiles()), {
    stem,
    workItemId: "BUG-20260719-001",
    archivePath: `docs/archive/${stem}.md`,
    issuePath: `docs/issues/${stem}.md`,
    planPath: `docs/plans/${stem}.md`,
  });
});

test("严格归档差异拒绝代码、多个摘要和不匹配计划", () => {
  const codeChange = validFiles();
  codeChange[5] = file("apps/web/src/page.tsx", "modified", 1, 1);
  assert.throws(() => validateArchiveFiles(codeChange), /越界文件/);

  const secondArchive = validFiles();
  secondArchive[5] = file("docs/archive/task-gov-002-other.md", "added", 4, 0);
  assert.throws(() => validateArchiveFiles(secondArchive), /唯一/);

  const wrongPlan = validFiles();
  wrongPlan[2] = file("docs/plans/task-gov-002-other.md", "removed", 0, 4);
  assert.throws(() => validateArchiveFiles(wrongPlan), /同名/);
});

test("成功 CI 后机器人按精确 Head 审批并 squash merge", async () => {
  const calls = [];
  const request = createRequestMock({ calls });
  const result = await finalizeArchivePullRequest(validEnvironment, request);

  assert.equal(result.workItemId, "BUG-20260719-001");
  assert.equal(result.deployed, false);
  assert.deepEqual(calls.filter((call) => ["POST", "PUT"].includes(call.method))
    .map((call) => `${call.method} ${call.pathname}`), [
    "POST /repos/cyhui555/deeptrail-open/pulls/55/reviews",
    "PUT /repos/cyhui555/deeptrail-open/pulls/55/merge",
  ]);
  const review = calls.find((call) => call.method === "POST").body;
  assert.equal(review.commit_id, head);
  assert.equal(review.event, "APPROVE");
  const merge = calls.find((call) => call.method === "PUT").body;
  assert.equal(merge.sha, head);
  assert.equal(merge.merge_method, "squash");
});

test("已有精确 Head 机器人审批时只执行幂等合并", async () => {
  const calls = [];
  const request = createRequestMock({
    calls,
    reviews: [{
      id: 7,
      user: { login: "github-actions[bot]" },
      state: "APPROVED",
      commit_id: head,
    }],
  });
  await finalizeArchivePullRequest(validEnvironment, request);
  assert.equal(calls.some((call) => call.method === "POST"), false);
  assert.equal(calls.some((call) => call.method === "PUT"), true);
});

test("机器人作者、失败 CI 与缺失检查均在写入前失败关闭", async () => {
  for (const options of [
    { author: "github-actions[bot]" },
    { runConclusion: "failure" },
    { checks: requiredChecks.slice(0, -1) },
  ]) {
    const calls = [];
    await assert.rejects(() => finalizeArchivePullRequest(
      validEnvironment,
      createRequestMock({ calls, ...options }),
    ));
    assert.equal(calls.some((call) => ["POST", "PUT"].includes(call.method)), false);
  }
});

test("归档 Finalizer Workflow 只能使用受信任 workflow_run 与最小写权限", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/archive-pr-finalizer.yml", import.meta.url),
    "utf8",
  );
  assert.deepEqual(validateArchiveFinalizerWorkflow(workflow), []);
  assert.deepEqual(validateWorkflowText(workflow, ".github/workflows/archive-pr-finalizer.yml"), []);
  assert.deepEqual(validateWorkflowText(workflow, ".github/workflows/untrusted.yml"), [
    "workflow-permissions-not-read-only",
  ]);
  assert.ok(validateArchiveFinalizerWorkflow(`${workflow}\non:\n  pull_request_target:\n`)
    .includes("archive-finalizer-workflow-trigger-too-broad"));
});

function createRequestMock(options = {}) {
  const calls = options.calls ?? [];
  const pullRequest = {
    html_url: "https://github.com/cyhui555/deeptrail-open/pull/55",
    state: "open",
    merged_at: null,
    draft: false,
    user: { login: options.author ?? "cyhui555" },
    base: { ref: "main", repo: { full_name: "cyhui555/deeptrail-open" } },
    head: {
      ref: `agent/archive/${stem}`,
      sha: head,
      repo: { full_name: "cyhui555/deeptrail-open" },
    },
    commits: 1,
    changed_files: 6,
    title: "BUG-20260719-001：归档验收与发布记录",
  };
  return async (method, pathname, requestOptions = {}) => {
    calls.push({ method, pathname, body: requestOptions.body });
    if (pathname.includes("/actions/runs/")) {
      return {
        name: "CI",
        event: "pull_request",
        status: "completed",
        conclusion: options.runConclusion ?? "success",
        head_sha: head,
        head_repository: { full_name: "cyhui555/deeptrail-open" },
        pull_requests: [{ number: 55, base: { ref: "main" }, head: { sha: head } }],
      };
    }
    if (method === "GET" && pathname.endsWith("/pulls/55")) return pullRequest;
    if (pathname.includes("/compare/")) {
      return { status: "ahead", behind_by: 0, ahead_by: 1 };
    }
    if (pathname.includes("/pulls/55/files")) return validFiles();
    if (pathname.includes("/contents/")) {
      const decoded = decodeURIComponent(pathname);
      if (decoded.includes(`docs/issues/${stem}.md`)
          || decoded.includes(`docs/plans/${stem}.md`)) return undefined;
      if (decoded.includes(`docs/archive/${stem}.md`)) {
        return content(`# BUG-20260719-001 交付摘要\n\n- 状态：Closed / G3\n`);
      }
      if (decoded.includes("docs/issues/board.md")) {
        return content(`## Verification\n\n## Closed\n\n- [摘要](../archive/${stem}.md)\n`);
      }
      if (decoded.includes("docs/memory/project-state.md")) {
        return content("- 活动工作项：`TASK-LOOP-008`\n");
      }
    }
    if (pathname.includes("/check-runs")) {
      return {
        check_runs: (options.checks ?? requiredChecks).map((name, index) => ({
          id: index + 1,
          name,
          status: "completed",
          conclusion: "success",
          head_sha: head,
          app: { id: 15368 },
        })),
      };
    }
    if (method === "GET" && pathname.includes("/reviews")) return options.reviews ?? [];
    if (method === "POST" && pathname.endsWith("/reviews")) {
      return {
        id: 99,
        user: { login: "github-actions[bot]" },
        state: "APPROVED",
        commit_id: head,
      };
    }
    if (method === "PUT" && pathname.endsWith("/merge")) {
      return { merged: true, sha: "c".repeat(40), message: "merged" };
    }
    throw new Error(`未处理的请求：${method} ${pathname}`);
  };
}

function validFiles() {
  return [
    file(`docs/archive/${stem}.md`, "added", 11, 0),
    file(`docs/issues/${stem}.md`, "removed", 0, 17),
    file(`docs/plans/${stem}.md`, "removed", 0, 8),
    file("docs/issues/board.md", "modified", 1, 1),
    file("docs/memory/project-state.md", "modified", 7, 7),
    file("docs/requirements/registry.md", "modified", 2, 2),
  ];
}

function file(filename, status, additions, deletions) {
  return {
    filename,
    status,
    additions,
    deletions,
    changes: additions + deletions,
    patch: "@@ -1 +1 @@\n-old\n+new",
  };
}

function content(value) {
  return {
    type: "file",
    encoding: "base64",
    size: Buffer.byteLength(value),
    content: Buffer.from(value).toString("base64"),
  };
}
