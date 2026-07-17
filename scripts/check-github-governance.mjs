import { readFile } from "node:fs/promises";
import process from "node:process";

const workflowPath = ".github/workflows/ci.yml";
const protectionPath = ".github/branch-protection-main.json";
const workflow = await readFile(workflowPath, "utf8");
const protection = JSON.parse(await readFile(protectionPath, "utf8"));
const failures = [];

const workflowJobNames = new Set(
  [...workflow.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)].map((match) => match[1]),
);
const requiredChecks = protection.required_status_checks?.contexts ?? [];
const governanceJob = workflow.match(/\n  governance-loop:[\s\S]*?\n  backend-quality:/)?.[0] ?? "";
if (!/uses:\s*actions\/checkout@v4[\s\S]*?fetch-depth:\s*0/.test(governanceJob)) {
  failures.push("Governance Job 必须获取完整 Git 历史");
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
