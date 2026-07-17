import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "check-public-history.mjs");

test("公开历史检查覆盖旧 Blob 且不回显凭据原值", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-public-history-test-"));
  try {
    git(temporaryRoot, ["init", "-b", "main"]);
    git(temporaryRoot, ["config", "user.name", "Deeptrail Test"]);
    git(temporaryRoot, ["config", "user.email", "deeptrail-test@example.invalid"]);
    await writeFile(path.join(temporaryRoot, "README.md"), "# clean\n", "utf8");
    git(temporaryRoot, ["add", "README.md"]);
    git(temporaryRoot, ["commit", "-m", "clean baseline"]);

    const clean = runAudit(temporaryRoot);
    assert.equal(clean.status, 0, clean.stderr);

    const token = ["ghp", "_", "B".repeat(36)].join("");
    await writeFile(path.join(temporaryRoot, "README.md"), `# unsafe\nvalue=${token}\n`, "utf8");
    await writeFile(path.join(temporaryRoot, ".env"), "PLACEHOLDER_ONLY=true\n", "utf8");
    git(temporaryRoot, ["add", "README.md", ".env"]);
    git(temporaryRoot, ["commit", "-m", "unsafe history"]);
    await writeFile(path.join(temporaryRoot, "README.md"), "# clean again\n", "utf8");
    await unlink(path.join(temporaryRoot, ".env"));
    git(temporaryRoot, ["add", "--all"]);
    git(temporaryRoot, ["commit", "-m", "remove unsafe value"]);

    const unsafe = runAudit(temporaryRoot);
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stderr, /github-token/);
    assert.match(unsafe.stderr, /tracked-environment-file/);
    assert.doesNotMatch(unsafe.stderr, new RegExp(token));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true });
}

function runAudit(cwd) {
  return spawnSync(process.execPath, [script, "--force"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}
