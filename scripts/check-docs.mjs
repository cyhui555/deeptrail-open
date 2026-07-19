import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

const markdownFiles = await walk(docsRoot);
let totalLines = 0;
let activeLines = 0;

for (const file of markdownFiles) {
  const content = await readFile(file, "utf8");
  const lines = content.split(/\r?\n/).length;
  const name = relative(file);
  totalLines += lines;
  if (!name.startsWith("docs/archive/")) activeLines += lines;

  const maxLines = name === "docs/api/接口说明书.md" ? 160 : name === "docs/memory/project-state.md" ? 40 : 320;
  if (lines > maxLines) errors.push(`${name} 为 ${lines} 行，超过 ${maxLines} 行预算`);

  if (/\b(?:ak|sk)_[A-Za-z0-9]{16,}\b/.test(content) || /\bsk-[A-Za-z0-9_-]{16,}\b/.test(content)) {
    errors.push(`${name} 疑似包含真实密钥值`);
  }

  if (/^docs\/(?:issues|plans)\//.test(name) && !name.endsWith("/board.md") && /^- (?:状态|验收状态)：(?:Done|已完成)/m.test(content)) {
    errors.push(`${name} 是已关闭的详细记录，应压缩到 docs/archive/`);
  }

  const linkPattern = /\[[^\]]*\]\((?!https?:|mailto:|#)([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = decodeURIComponent(match[1].split("#", 1)[0].trim().replace(/^<|>$/g, ""));
    if (!rawTarget) continue;
    const target = path.resolve(path.dirname(file), rawTarget);
    try {
      await stat(target);
    } catch {
      errors.push(`${name} 包含失效链接：${match[1]}`);
    }
  }
}

if (activeLines > 2600) errors.push(`活动 docs Markdown 共 ${activeLines} 行，超过 2600 行预算`);

const memoryNames = (await readdir(path.join(docsRoot, "memory"))).sort();
const allowedMemory = new Set(["README.md", "lessons.md", "project-state.md"]);
for (const name of memoryNames) {
  if (!allowedMemory.has(name)) errors.push(`docs/memory/${name} 不属于长期记忆最小集合`);
}

if (errors.length > 0) {
  console.error(`文档检查失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`文档检查通过：${markdownFiles.length} 个 Markdown，活动 ${activeLines} 行，总计 ${totalLines} 行。`);
