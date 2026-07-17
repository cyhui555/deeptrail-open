import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { normalizePath, scanText } from "./public-readiness.mjs";

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("用法：node scripts/check-report-artifacts.mjs <报告目录> [...]");
  process.exit(2);
}

const failures = [];
let scannedFiles = 0;
let existingRoots = 0;
const textExtensions = new Set([
  ".txt", ".log", ".json", ".xml", ".html", ".htm", ".md", ".csv", ".yaml", ".yml",
  ".js", ".css", ".properties", ".out", ".err", ".trx", ".sarif", ".svg",
]);
const blockedBinaryExtensions = new Set([".zip", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf"]);

for (const rootArgument of roots) {
  const absoluteRoot = path.resolve(rootArgument);
  let metadata;
  try {
    metadata = await lstat(absoluteRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      addFailure(normalizePath(path.relative(process.cwd(), absoluteRoot)), "missing-report-root");
      continue;
    }
    throw error;
  }
  existingRoots += 1;
  await inspectEntry(absoluteRoot, metadata);
}

if (existingRoots > 0 && scannedFiles === 0 && failures.length === 0) {
  addFailure("<report-set>", "empty-report-set");
}

if (failures.length > 0) {
  console.error(`报告产物安全检查失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`- ${failure.path}: ${failure.category}`);
  process.exit(1);
}

console.log(`报告产物安全检查通过：${existingRoots} 个输入，扫描 ${scannedFiles} 个文本文件。`);

async function inspectEntry(absolute, metadata = null) {
  const current = metadata ?? await lstat(absolute);
  const relative = normalizePath(path.relative(process.cwd(), absolute));
  if (current.isSymbolicLink()) {
    addFailure(relative, "symbolic-link");
    return;
  }
  if (current.isDirectory()) {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      await inspectEntry(path.join(absolute, entry.name));
    }
    return;
  }
  if (!current.isFile()) return;

  const extension = path.extname(absolute).toLowerCase();
  if (blockedBinaryExtensions.has(extension)) {
    addFailure(relative, "runtime-binary-attachment");
    return;
  }
  if (current.size > 25 * 1024 * 1024) {
    addFailure(relative, "oversized-report-not-scanned");
    return;
  }

  const buffer = await readFile(absolute);
  if (!textExtensions.has(extension) && extension !== "" && buffer.includes(0)) {
    addFailure(relative, "unscanned-binary-report");
    return;
  }
  const content = buffer.toString("utf8");
  scannedFiles += 1;
  for (const category of scanText(content, relative, { detectLikelyPublicNetwork: true })) {
    addFailure(relative, category);
  }
}

function addFailure(relativePath, category) {
  const key = `${relativePath}|${category}`;
  if (!failures.some((failure) => failure.key === key)) {
    failures.push({ key, path: relativePath, category });
  }
}
