# ADR：L3B 仅在人工批准与必需检查后受控合并

- 状态：Accepted / G3（独立 activation 准入）
- 日期：2026-07-18
- 关联：`REQ-LOOP-004`、`TASK-LOOP-006`

## 背景

L3A 已证明固定 Patch 可以在隔离 Worktree 中验证、提交并形成机器人 Draft PR，但没有合并权限。直接打开 GitHub auto-merge、管理员合并或让 Worker 自批，会破坏作者外审批、精确 Head 绑定和失败恢复。

## 决策

L3B 增加的是“人工已经批准后的受控合并”，不是自动审批。Engine 与 activation 继续分离：Engine 默认关闭并先经受保护 PR 合入；独立 activation 再绑定 Engine 批准 Head、main 合入 Revision、Review URL、稳定 Cohort 摘要和保护规则快照。

每次合并使用固定 MergePlan，并按以下顺序失败关闭：

1. 复核 L3A Transaction、passed Receipt、ChangePlan、Patch、Commit 与机器人 Draft PR 引用链。
2. 要求 PR 已由人工转为 Ready，仓库、Base、Head、Head OID 与计划完全一致，且没有额外 Commit 或路径。
3. 读取当前分支保护的 Required Checks，要求精确 Head 上全部成功；缺失、pending、skipped、neutral 或旧 Head 结果均不接受。
4. 要求机器人作者之外的允许人工 Reviewer 对精确 Head 提交 `APPROVED`，且 Review 未过期、未驳回、未被后续 Push 失效。
5. 在普通 squash merge 前立即重读 PR、Review、Checks、Head、Base 与保护规则；任何竞态都终止。
6. 仅调用非管理员、带 expected Head 的合并路径；合并后核对 PR 状态、main Revision、父提交、Tree 与审计引用。

## 权限边界

| 权限 | L3B |
| --- | --- |
| 创建/提交/推送/Draft PR | 继承 L3A |
| 转 Ready 与人工 Review | 仅人工 |
| 受控 squash merge | activation 后允许 |
| 自动审批、管理员绕过、force-push | 禁止 |
| 自动部署或生产写入 | 禁止 |

唯一人工所有者与机器人作者只构成账号级职责分离，不声明第二位人员审计。L3B 不修改 Required Checks、Review 规则或管理员保护设置，也不允许一次变更同时扩大权限并使用新权限。

## 事务与恢复

- preflight 不产生远端写入；merge 在独占 Writer Lock 与追加式 Gateway Transaction 内执行。
- 合并请求超时后不得重试写入，先按 PR 状态、merge commit、main Tree 和 Head OID 做只读判定。
- 已合并且结果完全匹配时只允许幂等 Postcheck；结果不一致时进入 recovery-required 并保留现场。
- 失败不关闭 PR、不删分支、不 force-push、不改写 Receipt，也不触发部署。

## 准入与退出

- G2：单元/集成威胁矩阵、临时远端真实合并、源工作树零污染及全工程适用门禁通过。
- G3：机器人 Engine PR 与独立 activation PR 分别由人工批准并受保护合入；再以全新、免费、无业务数据的文档 PR 完成真实合并试点。
- 任一 Cohort、保护规则、Engine Revision 或 Review 证据漂移时，activation 失效并回到默认关闭。

## 范围外

L3C 制品构建、Tag、Registry、环境批准、数据库迁移、Secret、部署和回滚不属于本 ADR；由 `REQ-LOOP-005` 独立准入。

## 拒绝方案

- GitHub auto-merge：合并时刻与 Gateway Transaction 不可精确绑定，拒绝。
- 管理员或 `--admin` 合并：绕过保护，拒绝。
- Worker 自动提交 Review 或转 Ready：伪造人工门禁，拒绝。
- 合并失败后自动删 PR/分支：抹除证据，拒绝。
