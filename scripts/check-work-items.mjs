import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const issuesRoot = path.join(root, "docs", "issues");
const boardPath = path.join(issuesRoot, "board.md");
const registryPath = path.join(root, "docs", "requirements", "registry.md");
const loopRoot = path.join(root, "scripts", "loop");
const failures = [];
const historicalWorkItems = new Map([
  [
    "docs/issues/task-loop-003-l1-phase2-to-l2.md",
    "docs/archive/task-loop-003-l2-proposal-admission.md"
  ],
  [
    "docs/issues/task-loop-006-l3b-controlled-merge.md",
    "docs/archive/task-loop-006-l3b-controlled-merge.md"
  ]
]);

const board = await readFile(boardPath, "utf8");
const registry = await readFile(registryPath, "utf8");
const cohortManifest = JSON.parse(await readFile(path.join(loopRoot, "l2-cohort.json"), "utf8"));
const retainedCohortItems = new Set(cohortManifest.registrations
  .map(({ workItem }) => workItem.replace(/^docs\/issues\//, "")));
const issueNames = (await readdir(issuesRoot))
  .filter((name) => /^(?:task|bug|spike)-[a-z0-9-]+\.md$/.test(name))
  .sort();
let activeItems = 0;
let retainedItems = 0;

for (const name of issueNames) {
  const content = await readFile(path.join(issuesRoot, name), "utf8");
  const headingId = content.match(/^#\s+([A-Z]+-[A-Z0-9]+-\d+)\b/m)?.[1];
  if (!headingId) {
    failures.push(`${name} 的一级标题缺少规范 Work Item ID`);
    continue;
  }
  if (!name.startsWith(`${headingId.toLowerCase()}-`)) {
    failures.push(`${name} 与标题 ID ${headingId} 不一致`);
  }
  const status = content.match(/^- 状态：(.+)$/m)?.[1]?.trim();
  if (!status) failures.push(`${name} 缺少状态字段`);
  else if (/^Closed\b/.test(status)) {
    retainedItems += 1;
    // 已关闭明细默认应压缩归档；L2 合同绑定的路径必须继续由 Git 跟踪，因此保留为明确例外。
    if (!retainedCohortItems.has(name)) {
      failures.push(`${name} 已关闭但不属于不可变 L2 Cohort，应压缩到 docs/archive`);
    }
  } else {
    activeItems += 1;
  }
  if (!/^## (?:目标|决策)$/m.test(content)) failures.push(`${name} 缺少目标或决策章节`);
  if (!/^## (?:验收标准|验收与退出|验收)$/m.test(content)) {
    failures.push(`${name} 缺少验收章节`);
  }
  if (!/^## (?:回滚|回退|约束与等价控制)$/m.test(content)) {
    failures.push(`${name} 缺少回滚、回退或等价控制章节`);
  }
  if (!/^- 关联(?: Requirement|需求|规则)：/m.test(content)) {
    failures.push(`${name} 缺少 Requirement、需求或规则关联`);
  }
  if (!board.includes(`(${name})`)) failures.push(`执行看板未链接活动项 ${name}`);

  const requirementIds = [...content.matchAll(/\bREQ-[A-Z0-9-]+\b/g)].map((match) => match[0]);
  for (const requirementId of new Set(requirementIds)) {
    if (!registry.includes(`| ${requirementId} |`)) {
      failures.push(`${name} 引用未登记 Requirement：${requirementId}`);
    }
  }
}

for (const file of await collectFiles(loopRoot, ".mjs")) {
  const content = await readFile(file, "utf8");
  const matches = content.matchAll(/docs\/issues\/(?:task|bug|spike)-[a-z0-9-]+\.md/g);
  for (const match of matches) {
    const relative = match[0];
    // 集成夹具在临时 Git 仓库内创建；其他硬编码输入必须在当前工程存在。
    if (relative.endsWith("-fixture.md")) continue;
    const absolute = path.join(root, ...relative.split("/"));
    try {
      await readFile(absolute, "utf8");
    } catch {
      const archived = historicalWorkItems.get(relative);
      if (archived) {
        try {
          // L2 Cohort 的排除项绑定历史 baseRevision；只在对应归档仍存在时接受旧路径。
          await readFile(path.join(root, ...archived.split("/")), "utf8");
          continue;
        } catch {
          failures.push(`${relative} 的历史归档不存在：${archived}`);
          continue;
        }
      }
      failures.push(`${path.relative(root, file)} 硬编码引用不存在的 Work Item：${relative}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Work Item 检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Work Item 检查通过：${activeItems} 个活动项、${retainedItems} 个 L2 历史证据与看板、Requirement 和运行时引用一致。`);

async function collectFiles(directory, extension) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(absolute);
  }
  return files;
}
