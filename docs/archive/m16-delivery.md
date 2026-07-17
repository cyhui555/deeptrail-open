# M16 Playwright 稳定性专项交付摘要

- 工作项：`TASK-M16-001`
- Requirement：`REQ-QUALITY-003`
- 路线图：`ROADMAP-005`
- 完成日期：2026-07-16

## 稳定性结果

- `tests/e2e` 中任意 `page.waitForTimeout` 从 15 处清零；替代等待均对应用户可见状态、确定性请求或明确应用就绪信号。
- 约 93 处位置选择器收敛为 3 个具有真实业务顺序语义的 `.first()`；`force` 与 `networkidle` 保持为 0。
- 地图替身新增 `data-amap-ready`，地图相关场景以显式 SDK 就绪状态替代估算加载时间。
- 首页、日期摘要、自定义地点、地图、媒体和任务状态场景改用 web-first assertion、响应边界或稳定可访问名称。

## 保留的顺序语义

- `checkin-diary-upgrade.spec.ts`：选择首日“进入全天打卡”按钮。
- `trip-plan.spec.ts`：选择行程中的首个打卡 POI。
- `node-revision.spec.ts`：选择首个时间线节点进行坐标或交通修正。

上述三处顺序本身就是被测业务前提，不用于掩盖定位器歧义。

## 长期证据

- 浏览器场景：`tests/e2e/**/*.spec.ts`
- 确定性地图边界：`tests/e2e/lib/amap-mock.ts`
- 审计起点：`docs/verification/m13-qa-audit.md`

## 验证

- 静态发现：24 个 spec、116 条测试；`waitForTimeout`、`force`、`networkidle` 均为 0，仅保留 3 个业务顺序选择器。
- 定向关键回归首轮 44 条中 43 条通过，暴露首页状态问题；修复后首页相关 15/15 通过，撤销单例 1/1 通过。
- Playwright 连续两轮全量 116 条均为：115 通过、1 条件跳过、0 失败。
- Server 627/627、Server E2E 37/37、Contract 1/1 通过，确认测试治理未破坏前后端执行契约。

## 已知边界

- 三个业务顺序选择器需要在产品顺序语义变化时同步复核，不能扩散为通用定位策略。
- 浏览器验收继续使用本地 AI、地图和确定性数据替身，不调用真实外部服务或用户数据。
