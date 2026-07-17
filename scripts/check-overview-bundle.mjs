import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const buildRoot = path.join(root, 'apps/web/.next');
const manifestPath = path.join(buildRoot, 'app-build-manifest.json');
const routeBudgets = [
  { route: '/(protected)/page', label: '首页', gzipBudgetKb: 145 },
  { route: '/(protected)/itineraries/[taskId]/page', label: '任务详情', gzipBudgetKb: 150 },
  { route: '/(protected)/trips/page', label: '行程列表', gzipBudgetKb: 140 },
  { route: '/(protected)/trips/[planId]/page', label: '行程详情', gzipBudgetKb: 155 },
  { route: '/(protected)/trips/[planId]/checkin/page', label: '现场执行', gzipBudgetKb: 160 },
  { route: '/(protected)/trips/[planId]/overview/page', label: '完整路线', gzipBudgetKb: 150 },
  { route: '/(protected)/trips/[planId]/track/page', label: '轨迹记录', gzipBudgetKb: 145 },
  { route: '/(protected)/trips/[planId]/review/page', label: '旅行回忆', gzipBudgetKb: 140 },
  { route: '/(protected)/profile/page', label: '个人资料', gzipBudgetKb: 130 },
  { route: '/(public)/login/page', label: '登录', gzipBudgetKb: 125 },
  { route: '/(protected)/admin/users/page', label: '用户管理', gzipBudgetKb: 140 },
];

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`全路由体积检查失败：请先完成 Web 生产构建（${error.message}）。`);
  process.exit(1);
}

let failed = false;
const fileSizeCache = new Map();

for (const budget of routeBudgets) {
  const files = manifest.pages?.[budget.route]?.filter((file) => file.endsWith('.js')) ?? [];
  if (files.length === 0) {
    console.error(`路由体积检查失败：构建清单缺少 ${budget.label}（${budget.route}）。`);
    failed = true;
    continue;
  }

  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    let size = fileSizeCache.get(file);
    if (!size) {
      const absolutePath = path.join(buildRoot, file);
      const [metadata, content] = await Promise.all([
        stat(absolutePath),
        readFile(absolutePath),
      ]);
      size = { raw: metadata.size, gzip: gzipSync(content).length };
      fileSizeCache.set(file, size);
    }
    rawBytes += size.raw;
    gzipBytes += size.gzip;
  }

  const gzipKb = gzipBytes / 1024;
  const rawKb = rawBytes / 1024;
  if (gzipKb > budget.gzipBudgetKb) {
    failed = true;
    console.error(
      `${budget.label}体积超限：gzip ${gzipKb.toFixed(1)} kB，预算 ${budget.gzipBudgetKb} kB。`,
    );
  } else {
    console.log(
      `${budget.label}体积通过：${files.length} 个首屏 JS，原始 ${rawKb.toFixed(1)} kB，gzip ${gzipKb.toFixed(1)} / ${budget.gzipBudgetKb} kB。`,
    );
  }
}

if (failed) process.exit(1);
