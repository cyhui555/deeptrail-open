import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateReleaseArtifactWorkflow,
  validateWorkflowText,
} from "../public-readiness.mjs";

const workflowPath = new URL("../../.github/workflows/release-artifacts.yml", import.meta.url);
const workflow = await readFile(workflowPath, "utf8");

test("远程制品 Workflow 只允许所有者从精确 main 手工发布", () => {
  assert.deepEqual(validateReleaseArtifactWorkflow(workflow), []);
  assert.deepEqual(validateWorkflowText(workflow, ".github/workflows/release-artifacts.yml"), []);
});

test("远程制品 Workflow 拒绝扩大触发器、权限、Secret 或部署边界", () => {
  assert.ok(validateReleaseArtifactWorkflow(`${workflow}\non:\n  push:\n`).includes(
    "release-workflow-trigger-too-broad",
  ));
  assert.ok(validateReleaseArtifactWorkflow(workflow.replace(
    "      packages: write",
    "      packages: write\n      contents: write",
  )).includes("release-workflow-permissions-drift"));
  assert.ok(validateReleaseArtifactWorkflow(workflow.replace(
    "${{ secrets.NEXT_PUBLIC_AMAP_KEY }}",
    "${{ secrets.UNSCOPED_TOKEN }}",
  )).includes("release-workflow-secret-drift"));
  assert.ok(validateReleaseArtifactWorkflow(`${workflow}\n# deploy.sh\n`).includes(
    "release-workflow-deployment-boundary-violation",
  ));
});
