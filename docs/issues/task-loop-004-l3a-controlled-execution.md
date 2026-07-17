# TASK-LOOP-004：L3A 隔离 Worktree 与 Draft PR 闭环

- 状态：In Progress / G1
- 优先级：P0
- Requirement：`REQ-LOOP-003`
- GitHub：[#34](https://github.com/cyhui555/deeptrail-open/issues/34)
- ExecPlan：[L3A 执行计划](../plans/task-loop-004-l3a-exec-plan.md)
- ADR：[L3 分阶段权限模型](../architecture/adr-loop-l3-staged-automation.md)

## 目标

在严格 L2 Cohort 恢复后，允许受控 Worker 根据已提交 Work Item、固定 ChangePlan 和不可变 Patch，在项目外隔离 Worktree 修改、验证、提交并创建 Draft PR。首个阶段不得自动审批、合并、部署或调用付费服务。

## 范围

- 固定仓库、主干、Revision、Patch Hash、路径、行数、文件数、命令和时长预算。
- 禁止修改 Loop Gateway、CI、部署、数据库迁移、依赖清单、Secret 与生产配置。
- 规范源工作树保持只读；失败 Worktree 和事务证据保留，禁止 force-push。
- Stage 与 Publish 都必须形成 Gateway Transaction、Receipt 和可恢复诊断。

## 验收

- [ ] `BUG-20260718-001` 关闭且 L2 严格 Cohort 为绿。
- [ ] 权限策略默认全关，只有绑定主干 Revision、L2 Receipt 和人工批准后才启用 L3A。
- [ ] 路径逃逸、Symlink、二进制、超预算、基线漂移、脏源树和非 Draft PR 全部失败关闭。
- [ ] 免费、无业务数据的试点完成隔离 Patch、固定 Profile、Commit 与 Draft PR。
- [ ] 自动审批、合并和部署仍为 false；后续 L3B/L3C 另行准入。

## 回滚

关闭 Policy activation 即停止新 Mutation；已创建 Worktree、远程分支与 Draft PR 保留审计，由人工决定关闭或删除，禁止自动抹除现场。
