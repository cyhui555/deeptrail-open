# TASK-GOV-003：收敛维护与治理控制面

- 状态：Ready for Review / G2
- 优先级：P0
- 关联 Requirement：`REQ-DOCS-001`、`REQ-GOV-001`、`REQ-LOOP-006`
- ExecPlan：[维护收敛计划](../plans/task-gov-003-simplify-maintenance.md)

## 目标

撤回没有稳定消费者的高权限归档自动化，降低依赖更新和文档治理的持续成本，并把远端分支、worktree、定时 Loop 与项目状态恢复到可理解的最小集合。

## 验收标准

1. Archive PR finalizer 的 Workflow、脚本、专项测试和安全扫描例外全部删除，主干保护不降低。
2. 三类 Dependabot 更新各最多保留 1 个 Open PR，仓库启用合并后自动删分支。
3. 文档预算只统计活动 Markdown；归档仍受单文件预算与链接、安全检查约束。
4. 已终止的 `TASK-GOV-002` 与已交付后暂停扩展的 `TASK-LOOP-007` 压缩归档，恢复点不再引用不存在的 `TASK-LOOP-008`。
5. 文档、Work Item、治理与公开安全门禁通过；不修改产品代码、数据库、部署或生产状态。

## 回滚

代码整改可通过本 PR 的单提交回退；远端清理前已保留恢复 bundle，Loop 保持暂停且不依赖本 PR 才能停止写入。
