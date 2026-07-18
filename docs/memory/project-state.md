# 当前项目状态

- 最后核对：2026-07-18
- 当前阶段：L3A activation 已以 PR #37 受保护合入；首次真实 preflight 暴露严格 Cohort Recovery 自冲突，正在修复
- 当前检查门：公开 `main@5c0cb33` 与远端一致；失败事务已终结、无 Writer/未终结事务；修复后原 Proposal 真实 preflight 与 Runtime 集成 1/1 通过，严格 Cohort 摘要不变
- 活动工作项：`BUG-20260718-001`、`BUG-20260718-002`、`TASK-LOOP-004`、`TASK-LOOP-005`、`TASK-RELEASE-003`、`TASK-OPS-002`
- 最近完成：`TASK-LOOP-003`、`TASK-GOV-001`、`TASK-WORKSPACE-001`、`TASK-LOOP-002`、`TASK-LOOP-001`

## 当前事实

- 旅迹产品 M0—M16、后台运营第一期和 v0.2.0 不可变目标环境发布已交付；详细历史位于 `docs/archive/`。
- LoopAny 固定为 `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`、CLI `0.2.0`、Bun `1.3.14`，使用项目外 Workspace、单写锁、Transaction v2、Receipt、Backup/隔离 Restore 与固定 Profile。
- `REQ-LOOP-002` 已以 PR #22—#32、公开 Cohort 10/10、目标机断网回归和不可变 Release/恢复完成 L2 Proposal-only 准入，历史结论见 [TASK-LOOP-003 摘要](../archive/task-loop-003-l2-proposal-admission.md)。
- 旧手册曾把公开仓指向历史私有 Home；该 Home 的 35 份 v2 + 五份 v1 已由固定 Backup 逐字节证明，正式公开 `deeptrail-open-loop` 未发生 Cohort 回退。
- `BUG-20260718-001` 与 L3A 引擎已由 PR #36 合入；批准 Head `340e729`、main 合入 Revision `c81c5cc` 和所有者 Review 均可远程复核。
- `REQ-LOOP-003` 采用 L3A/L3B/L3C 分段模型；本次 activation 只开放隔离 Worktree、Commit、新分支 Push 和机器人 Draft PR。

## 当前约束

- 禁止直推 `main`；变更经机器人机制作者或受控短期分支 PR、人工所有者审批和五项 Required Checks 合并，不自动部署。
- L3A 不能修改规范源工作树、`scripts/`、治理文档、CI、部署、数据库迁移、依赖清单、Secret 或生产配置；Profile 不继承用户凭据目录。
- 自动审批、自动合并与自动部署保持关闭；L3B/L3C 必须有独立 Requirement、准入证据和人工批准。
- 默认验证使用本地确定性替身，不读取用户数据，不调用真实付费 Provider。
- 完整生产放行仍缺 TLS、凭据轮换、远程制品链、独立介质 Restore 和正式回滚演练；不得由 L3A 推导放行。

## 最后验证

- `pnpm loop:test`：23/23，含真实临时 Git remote、隔离 Worktree、离线 Profile、Commit、Push 与机器人 Draft PR 身份复核。
- 公开 Home：Doctor 无 Writer/未终结事务；`pnpm loop:cohort:l2:strict` 以 49/49 v2、10/10 Work Items、17/17 Profiles 通过，`admissionDigest=0cb0880b…b431`。
- 历史 Home：`loop:receipts:verify` 为 35 份 v2 + 五份固定 Backup 证明 v1，`unattestedLegacy=0`。

## 下一项唯一动作

将 `BUG-20260718-002` 经机器人作者、人工批准和五项 Required Checks 合入，再以原固定 ChangePlan 重跑 `TASK-LOOP-005` 免费 L3A Draft PR 试点。
