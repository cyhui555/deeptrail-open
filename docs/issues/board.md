# 执行看板

- 最近更新：2026-07-17

## Verification

- `TASK-CI-001`：PR #23 已经唯一人工审批、五项 Required Checks 合并并完成 `quality-light` Shadow 首跑/复用，见[活动 Work Item](task-ci-001-node24-actions-runtime.md)与 [GitHub #18](https://github.com/cyhui555/deeptrail-open/issues/18)。
- `BUG-20260717-003`：AMap Production E2E 配置修复与第 5 项预登记已完成，待运行适用 Shadow，见[活动 Work Item](bug-20260717-003-amap-e2e-build-config.md)。
- `BUG-20260717-004`：PDF 主路径静态地图隔离与第 6 项预登记已完成，待运行适用 Shadow，见[活动 Work Item](bug-20260717-004-pdf-static-map-e2e-isolation.md)。
- `BUG-20260717-005`：真实 Development PWA Profile 与第 7 项预登记已完成，待运行适用 Shadow，见[活动 Work Item](bug-20260717-005-dev-pwa-e2e-profile.md)。
- `BUG-20260717-001`：修复已直接合入 `main@6495d3e`，待部署和目标环境复验，见[活动 Work Item](bug-20260717-001-optimize-watchdog-race.md)与 [GitHub #21](https://github.com/cyhui555/deeptrail/issues/21)。
- `BUG-20260717-002`：AI 非法 JSON 失败关闭与前端安全降级已完成本地 G2，待目标环境复验，见[活动 Work Item](bug-20260717-002-ai-json-parse-fallback-success.md)与 [GitHub #24](https://github.com/cyhui555/deeptrail/issues/24)。
- `TASK-LOOP-003`：单维护者受保护合并链已由 PR #22 实证；公开 Cohort Evidence 当前 4/10，第 5–7 项已预登记且待 Shadow，两个既有 Bug 仍待发布复验，见[活动 Work Item](task-loop-003-l1-phase2-to-l2.md)、[执行计划](../plans/task-loop-003-l1-phase2-exec-plan.md)与[准入报告](../verification/task-loop-003-m4-l2-admission.md)。

## Closed

- `TASK-GOV-001`：机器人作者 PR #22 经唯一人工所有者批准、五项 Required Checks 全绿后合并，直推例外已关闭，见[治理记录](task-gov-001-rapid-iteration-direct-main.md)。

M0–M10、TASK-MEM-001 与 5 个历史 Bug 见[既有交付摘要](../archive/m0-m10-delivery.md)；TASK-M11-001 见 [M11 交付摘要](../archive/m11-delivery.md)；TASK-M12-001 见 [M12 交付摘要](../archive/m12-delivery.md)；TASK-M13-001 见 [M13 交付摘要](../archive/m13-delivery.md)；TASK-M14-001 见 [M14 交付摘要](../archive/m14-delivery.md)；TASK-M16-001 见 [M16 交付摘要](../archive/m16-delivery.md)；BUG-20260716-001 见 [地图与 PDF 执行链路恢复摘要](../archive/bug-20260716-001-map-route-recovery.md)；ROADMAP-001 见 [v0.1.0 封板摘要](../archive/v0.1.0-release.md)；BUG-20260716-002 见 [自定义打卡点卡片样式热修摘要](../archive/bug-20260716-002-custom-checkin-card-style.md)；TASK-OPS-001 见 [后台用户管理交付摘要](../archive/task-ops-001-admin-user-management.md)；BUG-20260716-003 见 [PWA 配额与认证存储热修摘要](../archive/bug-20260716-003-pwa-quota-fallback.md)；TASK-RELEASE-002 见 [v0.2.0 目标环境发布报告](../archive/task-release-002-production-deployment.md)；TASK-LOOP-001 见 [LoopAny 本地闭环交付摘要](../archive/task-loop-001-loopany-gateway.md)；TASK-LOOP-002 见 [Loop 工程合同加固交付摘要](../archive/task-loop-002-loop-contract-hardening.md)；TASK-WORKSPACE-001 见 [规范工作区主干收口摘要](../archive/task-workspace-001-main-sync.md)。关闭项不再常驻详细 Issue/ExecPlan。
