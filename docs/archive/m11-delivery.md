# M11 PDF 按需加载交付摘要

- 工作项：`TASK-M11-001`
- Requirement：`REQ-PERF-001`
- 完成日期：2026-07-15

## 结果

- `PdfExportButton` 在用户点击后并行加载 PDF 生成与静态地图模块，首屏不再包含 `jsPDF`、`html2canvas` 和导出专用代码。
- 概览页 Route 从 `169 kB` 降至 `5.79 kB`，First Load JS 从 `275 kB` 降至 `112 kB`，首载减少约 `59%`。
- 新增生产构建预算检查，概览页首屏 JS gzip 估算为 `109.7 kB`，预算上限 `140 kB`。
- PDF 浏览器回归同时验证点击触发延迟分块、有效下载、A4 多页结构和无页面运行时异常。

## 长期证据

- 实现：`apps/web/src/components/PdfExportButton.tsx`
- 预算：`scripts/check-overview-bundle.mjs`、根命令 `pnpm perf:check`
- 回归：`tests/e2e/pdf-export-layout.spec.ts`
- CI：`.github/workflows/ci.yml`

## 验证

- `pnpm lint`、`pnpm typecheck`：通过。
- `pnpm build`：通过，概览页 `5.79 kB / 112 kB`。
- `pnpm perf:check`：通过，gzip 估算 `109.7 kB`。
- 隔离端口 Playwright PDF 定向回归：1/1 通过；未调用真实地图或 AI。

## 边界

本次不修改 PDF 版式、地图协议、后端接口或持久化数据；生产图片优化的 `sharp` 告警不在本工作项范围内。
