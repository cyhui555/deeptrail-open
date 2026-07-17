# BUG-20260717-005 开发态 PWA 边界被 Production E2E 错误执行

- 状态：Verification
- 优先级：P1
- 关联需求：`REQ-PERF-002`、`REQ-QUALITY-003`
- 发现环境：公开主仓 Full E2E workflow `29577848547`
- 最近更新：2026-07-17

## 目标

把开发态 Service Worker 注销与缓存清理合同放入真实 Next.js development Profile 验证，同时保持常规 Full E2E 使用 Production Server。

## 根因与范围

- 根布局只在 `NODE_ENV !== production` 时清理遗留 Worker 和旅迹缓存；Production 模式按产品合同注册 PWA。
- `scripts/run-e2e.mjs` 固定执行 Production build/server，却无条件运行名为“开发态”的用例，导致测试期待与受测运行模式矛盾。
- 修复增加显式 `production/development` Web 模式：常规套件不伪装开发态，开发态 PWA 用例由独立命令和定时/手工 Full E2E job 真实运行。

## 验收标准

- [x] 常规 Full E2E 明确传播 `DEEPTRAIL_E2E_WEB_MODE=production`，开发态用例在该模式下有原因地跳过。
- [x] `pnpm test:e2e:dev-boundaries` 启动真实 Next.js development server，并只运行两项开发态 PWA 合同。
- [x] Development Profile 验证旧 Worker 注销、旅迹缓存归零和存储 API 异常不产生页面未处理错误。
- [x] GitHub 手工/定时 Full E2E 同时执行 Production 全量套件和 Development PWA 边界，并分别保留 HTML 报告。

## 验证计划

- Development Profile 2/2；Production Profile 126 通过、3 项有原因跳过、0 失败。
- 运行器正常回收 Web/API/AI Mock 进程树与端口；CI 将两个 Profile 的 HTML 报告隔离保存。
- 合并前再以 `workflow_dispatch` 对锁定 SHA 复验远端双 Profile。

## 回滚

回退显式 Web 模式与独立命令并保留模式错配失败；不得把开发态断言改成生产预期或永久删除相关用例。
