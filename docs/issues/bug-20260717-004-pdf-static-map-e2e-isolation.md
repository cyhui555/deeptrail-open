# BUG-20260717-004 PDF 主路径 E2E 未隔离静态地图 REST 调用

- 状态：Closed / G3（Required Checks 已通过）
- 优先级：P1
- 关联需求：`REQ-BRAND-005`、`REQ-QUALITY-003`
- 发现环境：公开主仓 Full E2E workflow `29577848547`
- 最近更新：2026-07-17

## 目标

为 PDF 主路径回归补齐确定性静态地图图片替身，避免无真实地图 Key 的公开 CI 在导出阶段等待外部 `/api/static-map` 链路并超时。

## 根因与范围

- `pdf-export-layout.spec.ts` 已隔离 `/api/static-map`，但 `pdf-export.spec.ts` 两个主路径用例遗漏相同边界。
- PDF 生成会等待静态路线图，公开 CI 没有也不应持有真实高德 REST Key，因而两个下载事件在 30 秒后超时。
- 修复复用一像素 PNG 确定性替身，只验证 PDF 下载、文件头和交互合同，不掩盖生产 API 自身的独立测试。

## 验收标准

- [x] 两个 PDF 主路径用例在进入页面前拦截 `/api/static-map` 并返回有效 PNG。
- [x] 下载文件非空、以 `%PDF` 开头且按钮交互合同保持不变。
- [x] 测试不访问真实地图 REST 服务、不需要 Secret 且不产生费用。
- [x] 既有 PDF 布局、延迟坐标回填与 Web 质量门禁保持通过。

## 验证计划

- PDF 主路径与布局定向回归 4/4，下载、文件头、分页及延迟坐标回填均通过。
- Web lint、typecheck、build 及完整 Production Playwright 126/126 适用用例通过。

## 回滚

回退页面路由替身并保留 PDF 超时证据；不得把等待时间调大、写入真实 Key 或删除下载断言作为回滚方案。
