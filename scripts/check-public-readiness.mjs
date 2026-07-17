import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

import {
  normalizePath,
  scanText,
  validateTrackedPath,
  validateWorkflowText,
} from "./public-readiness.mjs";

const run = promisify(execFile);
const root = process.cwd();
const failures = [];
let scannedTextFiles = 0;
let skippedBinaryFiles = 0;

const { stdout } = await run("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "buffer",
  maxBuffer: 32 * 1024 * 1024,
});
const trackedFiles = stdout.toString("utf8").split("\0").filter(Boolean);

for (const relativePath of trackedFiles) {
  const normalized = normalizePath(relativePath);
  for (const category of validateTrackedPath(normalized)) addFailure(normalized, category);

  const absolute = path.join(root, ...normalized.split("/"));
  const metadata = await stat(absolute);
  if (metadata.size > 5 * 1024 * 1024) {
    if (/\.(?:md|txt|json|ya?ml|xml|html?|mjs|cjs|js|ts|tsx|jsx|java|sh|ps1|properties|sql)$/i.test(normalized)) {
      addFailure(normalized, "oversized-text-not-scanned");
    } else {
      skippedBinaryFiles += 1;
    }
    continue;
  }

  const buffer = await readFile(absolute);
  if (buffer.includes(0)) {
    skippedBinaryFiles += 1;
    continue;
  }
  const content = buffer.toString("utf8");
  scannedTextFiles += 1;
  for (const category of scanText(content, normalized)) addFailure(normalized, category);
  if (/^\.github\/workflows\/.*\.ya?ml$/i.test(normalized)) {
    for (const category of validateWorkflowText(content, normalized)) addFailure(normalized, category);
  }
}

const hasLicense = trackedFiles.some((file) => /^(?:LICENSE|COPYING)(?:\..*)?$/i.test(file));
if (!hasLicense) {
  console.warn("公开准备警告：仓库尚未选择 LICENSE；公开可见不等于授予开源使用许可。");
}

if (failures.length > 0) {
  console.error(`公开准备检查失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`- ${failure.path}: ${failure.category}`);
  process.exit(1);
}

console.log(
  `公开准备检查通过：${trackedFiles.length} 个跟踪文件，扫描 ${scannedTextFiles} 个文本文件，跳过 ${skippedBinaryFiles} 个二进制文件。`,
);

function addFailure(relativePath, category) {
  const key = `${relativePath}|${category}`;
  if (!failures.some((failure) => failure.key === key)) {
    failures.push({ key, path: relativePath, category });
  }
}
