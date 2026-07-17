import assert from "node:assert/strict";
import test from "node:test";

import {
  isPlaceholderValue,
  isPublicIpv4,
  scanText,
  validateTrackedPath,
  validateWorkflowText,
} from "../public-readiness.mjs";

test("高置信凭据只返回类别，不依赖输出原值", () => {
  const token = ["ghp", "_", "A".repeat(36)].join("");
  assert.deepEqual(scanText(`value=${token}`, "README.md"), ["github-token"]);
});

test("占位配置不会被当成真实凭据", () => {
  assert.equal(isPlaceholderValue("provider-key-not-configured"), true);
  assert.equal(scanText("api_key=provider-key-not-configured", ".env.example").length, 0);
});

test("公网地址与保留测试地址可以区分", () => {
  assert.equal(isPublicIpv4(["8", "8", "8", "8"].join(".")), true);
  assert.equal(isPublicIpv4(["127", "0", "0", "1"].join(".")), false);
  assert.equal(isPublicIpv4(["203", "0", "113", "10"].join(".")), false);
});

test("运维文档中的公网入口会失败关闭", () => {
  const address = ["8", "8", "8", "8"].join(".");
  assert.deepEqual(scanText(`目标入口：http://${address}:30301`, "docs/operations/deploy.md"), [
    "public-network-address",
  ]);
});

test("禁止跟踪运行环境文件和生成报告", () => {
  assert.deepEqual(validateTrackedPath(".env.production"), ["tracked-environment-file"]);
  assert.deepEqual(validateTrackedPath("test-results/trace.zip"), ["tracked-generated-artifact"]);
  assert.deepEqual(validateTrackedPath("infra/docker/production.env.example"), []);
});

test("公开 CI 禁止高权限触发和原始运行产物", () => {
  const workflow = [
    "on:",
    "  pull_request_target:",
    "permissions:",
    "  contents: write",
    "steps:",
    "  - uses: actions/upload-artifact@v4",
    "    with:",
    "      path: test-results/",
  ].join("\n");
  assert.deepEqual(validateWorkflowText(workflow), [
    "pull-request-target-trigger",
    "workflow-permissions-not-read-only",
    "raw-runtime-artifact-upload",
  ]);
});
