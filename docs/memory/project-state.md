# 当前项目状态

- 最后核对：2026-07-19
- 当前阶段：`TASK-GOV-004` G3 + `TASK-RELEASE-004` G3 + `TASK-LOOP-008` G2；`TASK-APP-001` 位于 PR #65 Review
- 当前检查门：公开 `main@52ac204` 为本次 fast-forward 基线；管理员旁路已在线上生效并完成治理验证
- 活动工作项：`TASK-RELEASE-004`（远程制品运行待执行）、`TASK-LOOP-008`（维护试运行）；`TASK-APP-001` 保持产品 Review

## 当前事实

- 旅迹 v0.2.0 已部署并完成目标环境 G3；坐标刷新与两项 AI 任务 Bug 已发布复验，旧私库 GitHub #21/#24 已关闭。
- `TASK-GOV-003` 已由 PR #59 合入 `main@0470f2f`；高权限 Archive PR finalizer 已删除，所有 PR 恢复人工 Review/Merge。
- `TASK-RELEASE-004` 已由 PR #62 合入 `main@88b5092`；五项 Required Checks 成功，`release-artifacts` Environment 仍无 Secret，Workflow 尚无运行记录且未部署。
- PR #60、#61 与文档 PR #63 已合入，公开主干推进到 `main@52ac204`；Android PR #65 由所有者账号创建，因作者身份与唯一 Reviewer 相同而无法形成作者外批准。
- 工程所有者明确采用单维护者模型：Agent 负责产出，所有者人工审核；同账号 PR 允许管理员显式旁路，自动化不得继承该权限。
- `TASK-GOV-004` 已完成：线上 `enforce_admins=false` 且 PR #65 `viewerCanMergeAsAdmin=true`，本地治理合同、ADR 与失败关闭边界同步完成。
- React Doctor Daily 保持 `0 6 * * *`（`Asia/Shanghai`）启用；复测已以 `nothing-new` 持久化 `healthScore=38`，不改变周期，不自动合并或部署。

## 当前约束

- 普通功能与治理分支禁止直推 `main`，仍经五项 Required Checks 和作者外审批合入；纯文档归档可按所有者授权经受检 fast-forward 直接合入。本次 `TASK-GOV-004` 配置收口另有所有者一次性明确授权，不扩张为后续代码直推例外。
- 同账号 Agent PR 可由唯一所有者核对精确 Head、Checks 与对话后执行管理员合并，但不生成虚假的自审批，也不开放自动审批、自动管理员合并或部署。
- 本次治理收口只修改 GitHub 主干保护合同、检查脚本与决策文档，不改变产品代码、数据库、制品或生产环境。
- 完整生产放行仍缺 TLS、凭据轮换、独立介质 Restore 和正式回滚演练，这些均不属于当前任务。
- `release-artifacts` 环境已创建并限制为受保护分支，当前 Secret 为空；尚需所有者配置两项 Web 构建值，不得从目标机复制 Server Secret 或把值写入 Git/日志。

## 当前验证

- 新 Workflow 合同测试已覆盖手动触发、最小权限、Secret 白名单与禁止部署边界；PR #62 的五项 Required Checks 成功，source bundle 已本地创建并通过 `git bundle verify`。
- `TASK-GOV-004`：`pnpm governance:check`、Loop 36/36 与安全测试 19/19 通过；线上 `enforce_admins=false`、PR #65 `viewerCanMergeAsAdmin=true`，未执行合并。
- L2 Cohort 的 10 个历史 Work Item 路径继续保留为不可变证据，但全部退出活动 WIP。
- React Doctor 复测完成 10 errors/130 warnings 的结构化扫描并安全回收 worktree；调度环境 `gh` 未认证，故没有代码或 PR。

## 下一项唯一动作

先将 PR #65 更新到最新 `main` 并解决冲突，再由工程所有者核对 Head、Checks 与对话后决定是否管理员合并；不自动合并或部署。
