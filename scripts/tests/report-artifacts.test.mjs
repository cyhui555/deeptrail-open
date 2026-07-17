import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "check-report-artifacts.mjs");

test("报告产物在上传前拒绝 Token 和二进制附件", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-report-safety-test-"));
  try {
    const report = path.join(temporaryRoot, "report.html");
    await writeFile(report, "<html><body>safe report</body></html>", "utf8");
    const clean = runCheck(temporaryRoot);
    assert.equal(clean.status, 0, clean.stderr);

    const token = ["ghp", "_", "C".repeat(36)].join("");
    await writeFile(report, `<html><body>${token}</body></html>`, "utf8");
    await writeFile(path.join(temporaryRoot, "trace.zip"), Buffer.from([0, 1, 2, 3]));
    const unsafe = runCheck(temporaryRoot);
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stderr, /github-token/);
    assert.match(unsafe.stderr, /runtime-binary-attachment/);
    assert.doesNotMatch(unsafe.stderr, new RegExp(token));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("报告产物在预期路径不存在时失败", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-report-missing-test-"));
  try {
    const missing = runCheck(path.join(temporaryRoot, "missing-report"));
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /missing-report-root/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("报告产物在目录为空时失败", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-report-empty-test-"));
  try {
    const emptyReport = path.join(temporaryRoot, "empty-report");
    await mkdir(emptyReport);
    const empty = runCheck(emptyReport);
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /empty-report-set/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});

function runCheck(target) {
  return spawnSync(process.execPath, [script, target], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
}
