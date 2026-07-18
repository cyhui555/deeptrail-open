# TASK-LOOP-007：建立人工合并边界下的自主任务入口

- 状态：Ready for Review / G3
- 优先级：P0
- 关联 Requirement：`REQ-LOOP-006`
- 上游：[L3A 交付摘要](../archive/task-loop-004-l3a-controlled-execution.md)
- ExecPlan：[自主任务入口执行计划](../plans/task-loop-007-autonomous-intake-exec-plan.md)

## 目标

在 `autoApprove=false`、`autoMerge=false`、`autoDeploy=false` 不变的前提下，建立只读 GitHub Issue 准入合同，使定时 Loop 能确定性地区分可执行需求、仅 Proposal 输入和已终止事项，不再被远端已关闭但本地摘要滞后的任务永久阻塞。

## 范围

- 固定仓库、可信请求者、`agent-ready` 标签、必需章节、大小预算与只读权限。
- 对单个 GitHub Issue 读取并输出脱敏判定；不返回正文，不写 Issue、分支、PR 或 Loop Home。
- 将已关闭或 `not_planned` 的事项判为终态且不阻塞队列。
- 收口已停止的 L3B activation 路线，默认关闭 Engine 只保留审计与回归价值。

## 验收标准

1. 合法 Open Issue 必须同时满足可信请求者、`agent-ready` 与完整的目标、验收标准、范围外、回滚章节，才返回 `executable`。
2. 缺标签、缺章节或请求者不可信时只返回 `proposal-only`；Closed Issue 返回 `terminal`，两者都不伪造成执行成功。
3. Pull Request、未知状态、超预算正文、未知 Policy 字段和任何写权限放宽均失败关闭。
4. 输出不包含 Issue 正文，合同摘要绑定仓库、编号、标题、标签、请求者、更新时间与正文 Hash。
5. Loop 单测、文档、Work Item 与治理检查通过；L3B 仍为 `l3b-disabled`。

## 范围外

- 自动创建或修改 Issue、自动编码、PR 续写、自动转 Ready、Review、Merge、Deploy。
- 生产日志采集、自动严重度判断和高风险变更专用通道。

## 回滚

移除只读 Intake 命令和 Policy 即可；该增量不产生远端写入或迁移。已合入的默认关闭 L3B Engine 保持不可调用，不删除其测试与审计历史。
