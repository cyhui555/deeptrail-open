# TASK-GOV-003 维护收敛 ExecPlan

- 状态：G2
- Work Item：[TASK-GOV-003](../issues/task-gov-003-simplify-maintenance.md)
- Requirement：`REQ-DOCS-001`、`REQ-GOV-001`、`REQ-LOOP-006`

## 计划

1. G0：冻结并核对 PR、Issue、Workflow、Automation、分支与 worktree 的精确状态，先生成可恢复包。
2. G1：关闭 PR #48/#56/#58 与 Issue #54，停用 Archive PR finalizer，回收旧分支/worktree并启用合并后自动删分支。
3. G2：删除归档控制面，Dependabot 限流，活动文档预算排除历史归档，同步需求、看板和恢复点。
4. G3：运行定向治理门禁，发布单提交 Draft PR；不合并、不部署，等待作者外 Review。

## 风险与恢复

远端删除均绑定精确 SHA，脏文件先 ZIP、孤立提交和关闭 PR Head 先 Git bundle；任何漂移即停止。整改只触及维护配置、治理脚本和文档，不改变业务运行时。
