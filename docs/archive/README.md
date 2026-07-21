# 历史归档导航

本目录保存已关闭、已终止或退出当前主线的压缩事实。恢复当前工作时不要默认加载历史正文；先读 `docs/memory/project-state.md` 和 `docs/issues/board.md`，仅在命中具体证据需求时进入本目录。

## 产品与发布

- 早期交付：[M0—M10](m0-m10-delivery.md)、[M11](m11-delivery.md)、[M12](m12-delivery.md)、[M13](m13-delivery.md)、[M14](m14-delivery.md)、[M16](m16-delivery.md)
- 发布：[v0.1.0](v0.1.0-release.md)、[v0.2.0 目标环境](task-release-002-production-deployment.md)
- 历史规划：[整体优化 PRD](optimization-prd.md)、[2026-07-19 路线图快照](future-roadmap-2026-07-19.md)

## 最近关闭与暂停

- [行程日期视图与任务筛选](task-product-002-trip-planning.md)
- [Android 基础切片与真机反馈验收](task-app-001-android-acceptance.md)
- [代码与文档校验归档](task-docs-004-code-doc-validation-archive.md)
- [小红书链接导入修复](bug-20260720-003-xiaohongshu-url-ingestion.md)
- [HTTP 405 错误映射](bug-20260719-002-http-method-error-mapping.md)
- [工作区事实源与清理收口](task-ops-003-workspace-remediation.md)
- [React Doctor Daily 暂停](task-loop-008-react-doctor-daily-trial.md)
- [维护控制面收敛](task-gov-003-simplify-maintenance.md)

## 安全与流程历史

- [2026-07-11 密钥轮换历史](security-key-rotation-20260711.md)
- [被替代的 ExecPlan 独立说明](legacy-exec-plan-guidance.md)

## Loop Engineering 历史

- 入口：[历史运行手册](loop-engineering-runbook.md)、[落地方案](loop-engineering-adoption-proposal.md)
- 决策：[Gateway ADR](adr-loopany-gateway.md)、[L3 分段 ADR](adr-loop-l3-staged-automation.md)、[L3B ADR](adr-loop-l3b-controlled-merge.md)
- 验收：[TASK-LOOP-001](verification-task-loop-001-loopany-gateway.md)、[TASK-LOOP-002](verification-task-loop-002-loop-contract-hardening.md)
- 收口：[L2 Proposal](task-loop-003-l2-proposal-admission.md)、[L3A](task-loop-004-l3a-controlled-execution.md)、[L3B](task-loop-006-l3b-controlled-merge.md)、[只读 Intake](task-loop-007-autonomous-intake.md)

## 取证边界

L2 Cohort 的 10 个 Work Item 路径仍由 `scripts/loop/l2-cohort.json` 绑定，作为不可变合同证据保留在 `docs/issues/`；它们不是活动任务，不应从执行看板逐项加载。
