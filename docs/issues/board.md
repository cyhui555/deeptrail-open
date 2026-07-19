# 执行看板

- 最近更新：2026-07-19
- WIP 上限：1 个产品/发布主任务 + 1 个维护试运行；依赖更新仅排队审查

## In Progress

- `TASK-APP-001`：只开发 Android 基础安装与启动切片，复用现有 H5/PWA，不扩展 iOS 或其他原生能力，见[活动 Work Item](task-app-001-android-basic.md)。

## Maintenance Trial

- `TASK-LOOP-008`：保留 React Doctor Daily；有界复测已持久化 `healthScore=38`，GitHub CLI 无调度认证时保持只读，不自动合并或部署，见[活动 Work Item](task-loop-008-react-doctor-daily-trial.md)。

## Review Queue（不计入 WIP）

- Dependabot PR #60 因 JJWT 三模块版本错配已 `CHANGES_REQUESTED`；#61 经 lint、typecheck、生产构建与体积预算验证后已批准，但按 WIP 边界保持未合并。两项均不自动合并。

## Operational Follow-up（不计入 WIP）

- [`TASK-RELEASE-004`](task-release-004-remote-artifact-chain.md) 已由 PR #62 合入 `main@88b5092`；首次真实远程制品运行仍等待环境配置，不部署，也不占用产品 WIP。

## Closed

- `TASK-GOV-003`：维护控制面已由 PR #59 收敛并合入 `main@0470f2f`，见[交付摘要](../archive/task-gov-003-simplify-maintenance.md)。
- L2 Cohort 的 10 个历史 Work Item 已闭环，但路径作为不可变证据保留：[TASK-GOV-001](task-gov-001-rapid-iteration-direct-main.md)、[BUG-20260717-001](bug-20260717-001-optimize-watchdog-race.md)、[BUG-20260717-002](bug-20260717-002-ai-json-parse-fallback-success.md)、[TASK-CI-001](task-ci-001-node24-actions-runtime.md)、[BUG-20260717-003](bug-20260717-003-amap-e2e-build-config.md)、[BUG-20260717-004](bug-20260717-004-pdf-static-map-e2e-isolation.md)、[BUG-20260717-005](bug-20260717-005-dev-pwa-e2e-profile.md)、[BUG-20260717-006](bug-20260717-006-release-identity-recovery.md)、[TASK-RELEASE-003](task-release-003-target-release-validation.md)、[TASK-OPS-002](task-ops-002-no-cost-target-regressions.md)。旧私库 GitHub #21/#24 已按发布与目标机证据关闭。
- `TASK-GOV-002`：归档自动审批/合并控制面已撤回，见[终止摘要](../archive/task-gov-002-archive-pr-finalizer.md)。
- `TASK-LOOP-007`：只读 Issue 准入已交付，后续自主提单扩展暂停，见[收敛摘要](../archive/task-loop-007-autonomous-intake.md)。
- `BUG-20260719-001` 与生产 E2E 修复已发布验收，分别见[坐标刷新摘要](../archive/bug-20260719-001-poi-coordinate-refresh.md)和[生产 E2E 摘要](../archive/bug-20260718-003-production-e2e-remediation.md)。

其余 M0—M16、后台运营、v0.1.0/v0.2.0、Loop L0—L3A 与工作区收口历史均以 `docs/archive/` 为事实入口，不再占用 WIP。
