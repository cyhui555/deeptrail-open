# 当前项目状态

- 最后核对：2026-07-19
- 当前阶段：`TASK-RELEASE-004` G2 + `TASK-LOOP-008` G2
- 当前检查门：公开 `main@0470f2f`；当前隔离分支 `agent/task-release-004-remote-artifact-chain`
- 活动工作项：`TASK-RELEASE-004`（唯一发布主任务）、`TASK-LOOP-008`（唯一维护试运行）

## 当前事实

- 旅迹 v0.2.0 已部署并完成目标环境 G3；坐标刷新与两项 AI 任务 Bug 已发布复验，旧私库 GitHub #21/#24 已关闭。
- `TASK-GOV-003` 已由 PR #59 合入 `main@0470f2f`；高权限 Archive PR finalizer 已删除，所有 PR 恢复人工 Review/Merge。
- React Doctor Daily 保持 `0 6 * * *`（`Asia/Shanghai`）启用；复测已以 `nothing-new` 持久化 `healthScore=38`，不改变周期，不自动合并或部署。
- Dependabot PR #60 已因 JJWT 模块版本错配被 `CHANGES_REQUESTED`；#61 已独立验证并批准但未合并。它们只在审查队列，不计入活动 WIP。

## 当前约束

- 禁止直推 `main`；短期分支经五项 Required Checks 和作者外审批合入，不保留自动审批、自动合并或自动部署例外。
- 当前只制作远程制品链：GitHub Actions 干净构建、GHCR digest、SBOM/provenance、源码 bundle 与校验和；不连接目标机。
- 完整生产放行仍缺 TLS、凭据轮换、独立介质 Restore 和正式回滚演练，这些均不属于当前任务。
- `release-artifacts` 环境已创建并限制为受保护分支，当前 Secret 为空；尚需所有者配置两项 Web 构建值，不得从目标机复制 Server Secret 或把值写入 Git/日志。

## 当前验证

- 新 Workflow 合同测试已覆盖手动触发、最小权限、Secret 白名单与禁止部署边界；source bundle 已本地创建并通过 `git bundle verify`。
- L2 Cohort 的 10 个历史 Work Item 路径继续保留为不可变证据，但全部退出活动 WIP。
- React Doctor 复测完成 10 errors/130 warnings 的结构化扫描并安全回收 worktree；调度环境 `gh` 未认证，故没有代码或 PR。

## 下一项唯一动作

完成本地治理门禁并创建机器人作者 Draft PR；合入并配置环境值后，才执行一次真实远程制品运行，不部署。
