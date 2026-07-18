# TASK-LOOP-005：L3A 零成本 Draft PR 试点

- 状态：Ready / G3
- 优先级：P0
- 关联 Requirement：`REQ-LOOP-003`
- 上游：`TASK-LOOP-004`、PR #36 与独立 activation PR

## 目标

在 activation 经保护规则合入后，用固定 ChangePlan 和 Patch 在项目外隔离 Worktree 新增 `docs/product/l3a-draft-pilot.md`，运行 `docs` Profile，提交并由机器人创建 Draft PR。试点不使用业务数据、生产凭据或付费服务。

## 验收

- [ ] 基线绑定 activation 合入后的完整 `main` Revision，Patch Hash、路径和提交信息固定。
- [ ] 规范源工作树不变；隔离 Profile、Commit、远程新分支与机器人 Draft PR 全部核验通过。
- [ ] `autoApprove`、`autoMerge`、`autoDeploy` 保持 `false`，试点 PR 不自动合并或部署。

## 回滚

关闭 activation 即停止新执行；已生成的 Worktree、事务、远程分支和 Draft PR 保留审计，任何清理由人工另行决定。
