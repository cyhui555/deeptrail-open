import { spawnSync } from "node:child_process";
import process from "node:process";

import { normalizePath, scanText, validateTrackedPath } from "./public-readiness.mjs";

const force = process.argv.includes("--force");
const repositoryPrivate = String(process.env.DEEPTRAIL_REPOSITORY_PRIVATE ?? "").toLowerCase();
if (!force && repositoryPrivate !== "false") {
  console.log("Git 历史公开检查已跳过：当前上下文未声明公开仓库；可用 --force 显式审计。");
  process.exit(0);
}

const failures = [];
const historyNameLines = runGit(
  ["-c", "core.quotepath=false", "log", "--all", "--format=commit:%H", "--name-only"],
  "utf8",
).split(/\r?\n/);
let pathCommit = "";
for (const line of historyNameLines) {
  if (line.startsWith("commit:")) {
    pathCommit = line.slice("commit:".length);
    continue;
  }
  if (!line || !pathCommit) continue;
  const relativePath = normalizePath(line);
  for (const category of validateTrackedPath(relativePath)) addFailure(relativePath, pathCommit, category);
}

const objectLines = runGit(["-c", "core.quotepath=false", "rev-list", "--objects", "--all"], "utf8")
  .trimEnd()
  .split(/\r?\n/)
  .filter(Boolean);
const objects = [];
const seenObjects = new Set();
for (const line of objectLines) {
  const separator = line.indexOf(" ");
  const oid = separator < 0 ? line : line.slice(0, separator);
  const relativePath = separator < 0 ? "" : normalizePath(line.slice(separator + 1));
  if (relativePath) {
    for (const category of validateTrackedPath(relativePath)) addFailure(relativePath, oid, category);
  }
  if (!seenObjects.has(oid)) {
    seenObjects.add(oid);
    objects.push({ oid, relativePath });
  }
}

const checkInput = Buffer.from(`${objects.map(({ oid }) => oid).join("\n")}\n`);
const checkOutput = runGit(
  ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
  null,
  checkInput,
).toString("utf8").trimEnd().split(/\r?\n/);
if (checkOutput.length !== objects.length) throw new Error("Git 对象批量检查数量不一致");

const blobs = [];
for (let index = 0; index < objects.length; index += 1) {
  const [oid, type, sizeText] = checkOutput[index].split(" ");
  const size = Number(sizeText);
  if (type === "blob" && Number.isSafeInteger(size) && size <= 5 * 1024 * 1024) {
    blobs.push({ ...objects[index], oid, size });
  }
}

const batchInput = Buffer.from(`${blobs.map(({ oid }) => oid).join("\n")}\n`);
const batchOutput = runGit(["cat-file", "--batch"], null, batchInput, 512 * 1024 * 1024);
let offset = 0;
let scannedTextBlobs = 0;
for (const blob of blobs) {
  const lineEnd = batchOutput.indexOf(10, offset);
  if (lineEnd < 0) throw new Error("Git Blob 响应缺少头部换行");
  const [oid, type, sizeText] = batchOutput.subarray(offset, lineEnd).toString("utf8").split(" ");
  const size = Number(sizeText);
  if (oid !== blob.oid || type !== "blob" || size !== blob.size) {
    throw new Error("Git Blob 响应身份不一致");
  }
  const contentStart = lineEnd + 1;
  const contentEnd = contentStart + size;
  const content = batchOutput.subarray(contentStart, contentEnd);
  offset = contentEnd + 1;
  if (content.includes(0)) continue;
  scannedTextBlobs += 1;
  const label = blob.relativePath || `<blob-${blob.oid.slice(0, 12)}>`;
  for (const category of scanText(content.toString("utf8"), label, { detectLikelyPublicNetwork: true })) {
    addFailure(label, blob.oid, category);
  }
}

if (failures.length > 0) {
  console.error(`Git 历史公开检查失败（${failures.length} 项）：`);
  for (const failure of failures) {
    console.error(`- ${failure.path}@${failure.oid.slice(0, 12)}: ${failure.category}`);
  }
  process.exit(1);
}

console.log(`Git 历史公开检查通过：${objects.length} 个对象，扫描 ${scannedTextBlobs} 个文本 Blob。`);

function runGit(args, encoding = null, input = undefined, maxBuffer = 64 * 1024 * 1024) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    input,
    encoding,
    maxBuffer,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} 失败（exit ${result.status}）`);
  }
  return result.stdout;
}

function addFailure(relativePath, oid, category) {
  const key = `${relativePath}|${oid}|${category}`;
  if (!failures.some((failure) => failure.key === key)) {
    failures.push({ key, path: relativePath, oid, category });
  }
}
