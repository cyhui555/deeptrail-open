import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { generateProposal } from '../scripts/loop/proposal.mjs';

const root = process.cwd();
const promptDir = path.join(root, 'apps/server/src/main/resources/prompts');
// V1 是空库建表的唯一事实源；后续版本仅负责增量升级。
const schemaPath = path.join(root, 'database/migrations/V1__initial_schema.sql');
const qualityCasesPath = path.join(root, 'evals/fixtures/ai-quality-cases.json');
const releaseSchemaPath = path.join(root, 'evals/release-outcome.schema.json');
const releaseOutcomePath = path.join(root, 'evals/fixtures/release-outcome.valid.json');
const proposalSchemaPath = path.join(root, 'evals/l2-proposal.schema.json');

const requiredPrompts = new Map([
  ['generate-itinerary.st', ['destination', 'days']],
  ['optimize-itinerary.st', ['currentItinerary', 'optimizationGoal']],
  ['journey-summary.st', []],
  ['xiaohongshu-itinerary.st', []],
]);

const failures = [];
const promptFiles = await readdir(promptDir);

for (const [name, variables] of requiredPrompts) {
  if (!promptFiles.includes(name)) {
    failures.push(`缺少 Prompt：${name}`);
    continue;
  }

  const content = await readFile(path.join(promptDir, name), 'utf8');
  if (content.trim().length < 40) {
    failures.push(`Prompt 内容异常短：${name}`);
  }
  for (const variable of variables) {
    if (!content.includes(`$${variable}$`)) {
      failures.push(`Prompt ${name} 缺少变量 $${variable}$`);
    }
  }
}

const schema = await readFile(schemaPath, 'utf8');
for (const table of ['user', 'itinerary_task', 'trip_plan', 'checkin_task']) {
  const pattern = new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${table}\\b`, 'i');
  if (!pattern.test(schema)) {
    failures.push(`Schema 缺少核心表：${table}`);
  }
}

const qualityDataset = JSON.parse(await readFile(qualityCasesPath, 'utf8'));
const cases = qualityDataset.cases;
if (qualityDataset.schemaVersion !== 1 || !Array.isArray(cases) || cases.length < 12) {
  failures.push('AI Eval 数据集必须使用 schemaVersion=1 且至少包含 12 个样本');
} else {
  const ids = new Set(cases.map((item) => item.id));
  if (ids.size !== cases.length || [...ids].some((id) => !/^[a-z0-9-]+$/.test(id))) {
    failures.push('AI Eval 样本 ID 必须唯一且使用小写连字符');
  }
  const boundaries = new Set(cases.map((item) => item.boundary));
  for (const boundary of ['parsing', 'scheduler', 'geocoding']) {
    if (!boundaries.has(boundary)) failures.push(`AI Eval 缺少边界：${boundary}`);
  }
  const taskTypes = new Set(cases.map((item) => item.taskType));
  for (const taskType of ['generate', 'optimize', 'xiaohongshu']) {
    if (!taskTypes.has(taskType)) failures.push(`AI Eval 缺少任务类型：${taskType}`);
  }
  const parsing = cases.filter((item) => item.boundary === 'parsing');
  const validParsing = parsing.filter((item) => item.expected?.valid === true);
  const invalidReasons = new Set(parsing
    .filter((item) => item.expected?.valid === false)
    .map((item) => item.expected.reason));
  if (validParsing.length < 5) failures.push('AI Eval 合法结构样本少于 5 个');
  for (const reason of ['EMPTY_RESPONSE', 'MALFORMED_JSON', 'MISSING_DAYS']) {
    if (!invalidReasons.has(reason)) failures.push(`AI Eval 缺少非法原因：${reason}`);
  }
  for (const item of cases.filter((candidate) => candidate.boundary === 'scheduler')) {
    if (item.expected.providerCallsAfterTerminal !== 0
        || item.expected.businessWritesAfterTerminal !== 0) {
      failures.push(`调度边界未失败关闭：${item.id}`);
    }
  }
}

const releaseSchema = JSON.parse(await readFile(releaseSchemaPath, 'utf8'));
const releaseOutcome = JSON.parse(await readFile(releaseOutcomePath, 'utf8'));
if (releaseSchema.properties?.schemaVersion?.const !== 1
    || releaseOutcome.schemaVersion !== 1) {
  failures.push('Release Outcome Schema 或样本版本不是 1');
}
const release = releaseOutcome.release ?? {};
if (!/^[0-9a-f]{40,64}$/.test(release.gitCommit ?? '')
    || !/^sha256:[0-9a-f]{64}$/.test(release.serverArtifactDigest ?? '')) {
  failures.push('Release Outcome 缺少可验证的 Commit 或制品摘要');
}
const totals = releaseOutcome.totals ?? {};
if (totals.tasks !== totals.completed + totals.failed + totals.timeout + totals.cancelled) {
  failures.push('Release Outcome 任务终态合计不闭合');
}
if ((releaseOutcome.latencyMs?.p95 ?? -1) < (releaseOutcome.latencyMs?.p50 ?? 0)) {
  failures.push('Release Outcome 延迟分位数不合法');
}
if (Object.values(releaseOutcome.privacy ?? {}).some((value) => value !== false)) {
  failures.push('Release Outcome 隐私声明必须全部为 false');
}
const serializedOutcome = JSON.stringify(releaseOutcome);
for (const forbiddenKey of ['"prompt":', '"userId":', '"rawResponse":', '"itinerary":']) {
  if (serializedOutcome.includes(forbiddenKey)) {
    failures.push(`Release Outcome 包含禁止载荷字段：${forbiddenKey}`);
  }
}
const proposalSchema = JSON.parse(await readFile(proposalSchemaPath, 'utf8'));
const proposal = generateProposal(releaseOutcome);
if (proposalSchema.properties?.mode?.const !== 'proposal-only'
    || proposal?.mode !== 'proposal-only'
    || proposal?.decision !== 'human-review-required'
    || Object.values(proposal?.constraints ?? {}).some((value) => value !== false)) {
  failures.push('L2 Proposal-only Schema、人工审批或权限禁令不完整');
}

if (failures.length > 0) {
  console.error('Eval 失败：');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Eval 通过：${requiredPrompts.size} 个 Prompt、4 个核心表、`
    + `${cases.length} 个 AI 质量样本与 Release Outcome 合同有效。`,
);
