# TASK-LOOP-008：React Doctor Daily 业务试运行（已暂停归档）

- 状态：Paused / Archived
- 优先级：退出维护槽位
- 关联 Requirement：`REQ-LOOP-007`
- Loop：`Deeptrail React Doctor Daily`（`loop-mrqhdf3j-90f66952`）

## 目标

保留每日 React Doctor 诊断，并用一次有界临时运行验证 Loop 从调度、隔离扫描到结果通知或 Draft PR 的真实业务闭环。

## 验收标准

- [x] 试运行期间时区为 `Asia/Shanghai`，Cron 为 `0 6 * * *`。
- [x] 先后追加两次有界 `runAt`：首轮暴露报告指标缺失，修正报告入口后复测；不改写日常周期。
- [x] 复测终态为 `nothing-new`，主干 38 分（Critical，10 errors/130 warnings），`state.healthScore=38` 与短消息均已持久化。
- [x] 调度环境 `gh` 未认证时失败关闭写路径，本轮没有源码、分支或 PR；任何后续修复仍只允许一个最高严重度问题，不得自动合并或部署。
- [x] Dependabot PR #60/#61 不计入本维护槽位，也不由 Loop 自动合并。

## 回滚

若运行越界或连续失败，先禁用该 Loop 并保留日志；关闭它产生的未合入 PR 或分支即可恢复，不改动主干、发布制品或生产环境。

## 试运行结论

调度、全新 worktree、依赖安装、React Doctor 结构化扫描、安全清理和 Loopany 数值报告链已真实通过，但 5 次运行没有产生可合入修复，最新仍为 `healthScore=38`，且 daemon 环境无法读取 GitHub CLI 登录态。该循环于 2026-07-20 设置 `enabled=false`，历史任务文件与运行记录保留；只有工程所有者重新确认产品关联、写路径和运行预算后才可恢复。
