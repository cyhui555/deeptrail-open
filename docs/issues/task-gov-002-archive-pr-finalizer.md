# TASK-GOV-002：严格归档 PR 自动收口
- 状态：Ready for Review / G2
- 关联 Requirement：`REQ-GOV-001`
- ExecPlan：[归档自动收口计划](../plans/task-gov-002-archive-pr-finalizer.md)
## 目标
保留功能与治理 PR 的人工审批，仅让所有者创建、精确绑定最新 `main` 和成功 CI 的严格归档 PR 由机器人作者外审批并 squash merge；不触发部署。
## 验收标准
合法归档须为 `agent/archive/<Work-Item>` 单提交，只新增同名摘要、删除同名 Work Item/可选 ExecPlan 并同步受控索引；机器人作者、Draft、代码或 Workflow、失败/陈旧检查及任一 Head 漂移必须在写入前拒绝。真实归档完成自动审批与合并，五项主干保护保持不变。
## 回滚
移除 Finalizer Workflow 与脚本即可；不修改主干保护、数据库、生产配置或部署状态，已完成的普通 squash merge 保留审计。
