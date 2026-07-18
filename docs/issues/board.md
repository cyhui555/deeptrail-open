# 执行看板

- 最近更新：2026-07-18

## Verification

- `TASK-LOOP-007`：在人工 Review/Merge 边界下建立只读 Issue 准入合同，先消除终态事项阻塞，再推进自动提单与 PR 生命周期，见[活动 Work Item](task-loop-007-autonomous-intake.md)与[执行计划](../plans/task-loop-007-autonomous-intake-exec-plan.md)。
- `BUG-20260717-006`：身份贡献器、不可变发布及健康后故障注入自动恢复均通过，见[活动 Work Item](bug-20260717-006-release-identity-recovery.md)。
- `TASK-RELEASE-003`：目标机 117/117 固定回归、Release 身份与恢复演练通过，见[活动 Work Item](task-release-003-target-release-validation.md)。
- `TASK-OPS-002`：零付费、无生产密钥且固定回归阶段断网的目标机回归已固化，见[活动 Work Item](task-ops-002-no-cost-target-regressions.md)。
- `TASK-CI-001`：PR #23 已经唯一人工审批、五项 Required Checks 合并并完成 `quality-light` Shadow 首跑/复用，见[活动 Work Item](task-ci-001-node24-actions-runtime.md)与 [GitHub #18](https://github.com/cyhui555/deeptrail-open/issues/18)。
- `BUG-20260717-003`：AMap Production E2E 配置修复及第 5 项 `quality-web/smoke` Shadow 首跑、复用已完成，见[活动 Work Item](bug-20260717-003-amap-e2e-build-config.md)。
- `BUG-20260717-004`：PDF 主路径静态地图隔离及第 6 项 `quality-web/smoke` Shadow 首跑、复用已完成，见[活动 Work Item](bug-20260717-004-pdf-static-map-e2e-isolation.md)。
- `BUG-20260717-005`：真实 Development PWA Profile 及第 7 项 `quality-web/smoke` Shadow 首跑、复用已完成，见[活动 Work Item](bug-20260717-005-dev-pwa-e2e-profile.md)。
- `BUG-20260717-001`：并发、截止时间与迟到成功固定回归已在目标机通过，见[活动 Work Item](bug-20260717-001-optimize-watchdog-race.md)与 [GitHub #21](https://github.com/cyhui555/deeptrail/issues/21)。
- `BUG-20260717-002`：非法 JSON 失败关闭与前端安全降级已发布复验，见[活动 Work Item](bug-20260717-002-ai-json-parse-fallback-success.md)与 [GitHub #24](https://github.com/cyhui555/deeptrail/issues/24)。

## Closed

- `TASK-LOOP-006`：默认关闭 Engine 已由 PR #43 合入；activation PR #44 关闭未合入，GitHub #41 以 `not_planned` 终止，见[L3B 终止摘要](../archive/task-loop-006-l3b-controlled-merge.md)。
- `TASK-LOOP-004` / `TASK-LOOP-005` / `BUG-20260718-001` / `BUG-20260718-002`：Receipt 兼容、L3A Engine/activation、Recovery 修复与机器人 Draft PR #40 真实试点均完成，见 [L3A 交付摘要](../archive/task-loop-004-l3a-controlled-execution.md)。
- `TASK-GOV-001`：机器人作者 PR #22 经唯一人工所有者批准、五项 Required Checks 全绿后合并，直推例外已关闭，见[治理记录](task-gov-001-rapid-iteration-direct-main.md)。
- `TASK-LOOP-003`：L1 Phase 2 与 L2 Proposal-only 准入完成，见[交付摘要](../archive/task-loop-003-l2-proposal-admission.md)。

M0–M10、TASK-MEM-001 与 5 个历史 Bug 见[既有交付摘要](../archive/m0-m10-delivery.md)；TASK-M11-001 见 [M11 交付摘要](../archive/m11-delivery.md)；TASK-M12-001 见 [M12 交付摘要](../archive/m12-delivery.md)；TASK-M13-001 见 [M13 交付摘要](../archive/m13-delivery.md)；TASK-M14-001 见 [M14 交付摘要](../archive/m14-delivery.md)；TASK-M16-001 见 [M16 交付摘要](../archive/m16-delivery.md)；BUG-20260716-001 见 [地图与 PDF 执行链路恢复摘要](../archive/bug-20260716-001-map-route-recovery.md)；ROADMAP-001 见 [v0.1.0 封板摘要](../archive/v0.1.0-release.md)；BUG-20260716-002 见 [自定义打卡点卡片样式热修摘要](../archive/bug-20260716-002-custom-checkin-card-style.md)；TASK-OPS-001 见 [后台用户管理交付摘要](../archive/task-ops-001-admin-user-management.md)；BUG-20260716-003 见 [PWA 配额与认证存储热修摘要](../archive/bug-20260716-003-pwa-quota-fallback.md)；TASK-RELEASE-002 见 [v0.2.0 目标环境发布报告](../archive/task-release-002-production-deployment.md)；TASK-LOOP-001 见 [LoopAny 本地闭环交付摘要](../archive/task-loop-001-loopany-gateway.md)；TASK-LOOP-002 见 [Loop 工程合同加固交付摘要](../archive/task-loop-002-loop-contract-hardening.md)；TASK-WORKSPACE-001 见 [规范工作区主干收口摘要](../archive/task-workspace-001-main-sync.md)。关闭项不再常驻详细 Issue/ExecPlan。
