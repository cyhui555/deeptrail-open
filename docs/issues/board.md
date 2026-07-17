# 执行看板

- 最近更新：2026-07-17

## In Progress

- `TASK-GOV-001`：快速迭代期允许经验证的提交直接合入 `main`，见[临时治理例外](task-gov-001-rapid-iteration-direct-main.md)。

## Verification

- `TASK-CI-001`：升级并锁定 GitHub Actions Node 24 Runtime，待受保护 CI 复验，见[活动 Work Item](task-ci-001-node24-actions-runtime.md)与 [GitHub #18](https://github.com/cyhui555/deeptrail-open/issues/18)。
- `BUG-20260717-001`：修复已直接合入 `main@6495d3e`，待部署和目标环境复验，见[活动 Work Item](bug-20260717-001-optimize-watchdog-race.md)与 [GitHub #21](https://github.com/cyhui555/deeptrail/issues/21)。
- `BUG-20260717-002`：AI 非法 JSON 失败关闭与前端安全降级已完成本地 G2，待目标环境复验，见[活动 Work Item](bug-20260717-002-ai-json-parse-fallback-success.md)与 [GitHub #24](https://github.com/cyhui555/deeptrail/issues/24)。
- `TASK-LOOP-003`：L1 Phase 2 本地 G2、脱敏公开主仓、远程 CI 与主干保护已完成，L2 仍等待独立 Review、发布复验和 10 项新样本，见[活动 Work Item](task-loop-003-l1-phase2-to-l2.md)、[执行计划](../plans/task-loop-003-l1-phase2-exec-plan.md)与[准入报告](../verification/task-loop-003-m4-l2-admission.md)。

## Closed

M0–M10、TASK-MEM-001 与 5 个历史 Bug 见[既有交付摘要](../archive/m0-m10-delivery.md)；TASK-M11-001 见 [M11 交付摘要](../archive/m11-delivery.md)；TASK-M12-001 见 [M12 交付摘要](../archive/m12-delivery.md)；TASK-M13-001 见 [M13 交付摘要](../archive/m13-delivery.md)；TASK-M14-001 见 [M14 交付摘要](../archive/m14-delivery.md)；TASK-M16-001 见 [M16 交付摘要](../archive/m16-delivery.md)；BUG-20260716-001 见 [地图与 PDF 执行链路恢复摘要](../archive/bug-20260716-001-map-route-recovery.md)；ROADMAP-001 见 [v0.1.0 封板摘要](../archive/v0.1.0-release.md)；BUG-20260716-002 见 [自定义打卡点卡片样式热修摘要](../archive/bug-20260716-002-custom-checkin-card-style.md)；TASK-OPS-001 见 [后台用户管理交付摘要](../archive/task-ops-001-admin-user-management.md)；BUG-20260716-003 见 [PWA 配额与认证存储热修摘要](../archive/bug-20260716-003-pwa-quota-fallback.md)；TASK-RELEASE-002 见 [v0.2.0 目标环境发布报告](../archive/task-release-002-production-deployment.md)；TASK-LOOP-001 见 [LoopAny 本地闭环交付摘要](../archive/task-loop-001-loopany-gateway.md)；TASK-LOOP-002 见 [Loop 工程合同加固交付摘要](../archive/task-loop-002-loop-contract-hardening.md)；TASK-WORKSPACE-001 见 [规范工作区主干收口摘要](../archive/task-workspace-001-main-sync.md)。关闭项不再常驻详细 Issue/ExecPlan。
