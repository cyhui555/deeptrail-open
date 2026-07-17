import { readFile, readdir } from "node:fs/promises";
import process from "node:process";

const workflowPath = ".github/workflows/ci.yml";
const workflowsRoot = ".github/workflows";
const protectionPath = ".github/branch-protection-main.json";
const workflow = await readFile(workflowPath, "utf8");
const workflowFiles = (await readdir(workflowsRoot))
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();
const workflowSources = await Promise.all(workflowFiles.map(async (name) => ({
  name,
  content: await readFile(`${workflowsRoot}/${name}`, "utf8"),
})));
const protection = JSON.parse(await readFile(protectionPath, "utf8"));
const failures = [];
const requiredActions = new Map([
  ["actions/checkout", { sha: "9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0", version: "v7" }],
  ["actions/setup-node", { sha: "820762786026740c76f36085b0efc47a31fe5020", version: "v7" }],
  ["actions/setup-java", { sha: "03ad4de0992f5dab5e18fcb136590ce7c4a0ac95", version: "v5" }],
  ["actions/upload-artifact", { sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a", version: "v7" }],
  ["pnpm/action-setup", { sha: "0ebf47130e4866e96fce0953f49152a61190b271", version: "v6" }],
]);

const workflowJobNames = new Set(
  [...workflow.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)].map((match) => match[1]),
);
const requiredChecks = protection.required_status_checks?.contexts ?? [];
const governanceJob = workflow.match(/\n  governance-loop:[\s\S]*?\n  backend-quality:/)?.[0] ?? "";
const checkout = requiredActions.get("actions/checkout");
if (!new RegExp(`uses:\\s*actions/checkout@${checkout.sha}[\\s\\S]*?fetch-depth:\\s*0`)
  .test(governanceJob)) {
  failures.push("Governance Job 必须获取完整 Git 历史");
}
const seenActions = new Set();
// 扫描全部 Workflow，避免通过新增 YAML 绕过已发布的 Action 允许列表与 SHA 锁定合同。
for (const source of workflowSources) {
  for (const match of source.content.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#\s+(v\d+))?\s*$/gm)) {
    const [, specifier, version] = match;
    if (specifier.startsWith("./")) continue;
    const separator = specifier.lastIndexOf("@");
    if (separator <= 0) {
      failures.push(`${source.name} 使用了未固定引用：${specifier}`);
      continue;
    }
    const action = specifier.slice(0, separator);
    const reference = specifier.slice(separator + 1);
    const expected = requiredActions.get(action);
    if (!expected) failures.push(`${source.name} 使用了未登记 Action：${action}`);
    else if (reference !== expected.sha || version !== expected.version) {
      failures.push(`${source.name} 的 ${action} 必须固定为 ${expected.version} 的完整 Commit SHA`);
    }
    if (!/^[a-f0-9]{40}$/.test(reference)) {
      failures.push(`${source.name} 的 ${action} 未固定完整 Commit SHA`);
    }
    seenActions.add(action);
  }
}
for (const action of requiredActions.keys()) {
  if (!seenActions.has(action)) failures.push(`Workflow 缺少必需 Action：${action}`);
}
for (const context of requiredChecks) {
  if (!workflowJobNames.has(context)) failures.push(`Required Check 不存在于 CI Job：${context}`);
}
if (requiredChecks.length !== 5) failures.push("main 必须精确要求五项常驻 CI 检查");
if (!protection.required_status_checks?.strict) failures.push("Required Checks 必须基于最新 main");
if (!protection.enforce_admins) failures.push("管理员必须遵守 main 保护");
if ((protection.required_pull_request_reviews?.required_approving_review_count ?? 0) < 1) {
  failures.push("main 至少需要一名非 PR 作者 Reviewer");
}
if (!protection.required_pull_request_reviews?.dismiss_stale_reviews) {
  failures.push("新提交后必须撤销过期批准");
}
if (!protection.required_pull_request_reviews?.require_last_push_approval) {
  failures.push("最后一次 Push 必须由其他人批准");
}
if (!protection.required_conversation_resolution) failures.push("合并前必须解决 Review 对话");
if (!protection.required_linear_history) failures.push("main 必须保持线性历史");
if (protection.allow_force_pushes) failures.push("main 禁止 force-push");
if (protection.allow_deletions) failures.push("main 禁止删除");

if (failures.length > 0) {
  console.error(`GitHub 治理合同检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`GitHub 治理合同通过：${requiredChecks.length} 项 Required Checks，PR 作者外审批与 main 防护已声明。`);
