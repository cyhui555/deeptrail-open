# 当前项目状态

- 最后核对：2026-07-18
- 当前阶段：正式公开 L2 Proposal-only 严格 Cohort 持续为绿；历史 v1 Receipt 已本地兼容，L3A 默认关闭引擎正在 G2 验证
- 当前检查门：公开 `main@020638c` 与远端一致、CI 成功；公开 Home Doctor 与严格 Cohort 49/49 v2、10 Work Items / 17 Profiles 通过；当前分支 Loop 单测 23/23
- 活动工作项：`BUG-20260718-001`、`TASK-LOOP-004`、`TASK-RELEASE-003`、`TASK-OPS-002`
- 最近完成：`TASK-LOOP-003`、`TASK-GOV-001`、`TASK-WORKSPACE-001`、`TASK-LOOP-002`、`TASK-LOOP-001`

## 当前事实

- 旅迹产品 M0—M16、后台运营第一期和 v0.2.0 不可变目标环境发布已交付；详细历史位于 `docs/archive/`。
- LoopAny 固定为 `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`、CLI `0.2.0`、Bun `1.3.14`，使用项目外 Workspace、单写锁、Transaction v2、Receipt、Backup/隔离 Restore 与固定 Profile。
- `REQ-LOOP-002` 已以 PR #22—#32、公开 Cohort 10/10、目标机断网回归和不可变 Release/恢复完成 L2 Proposal-only 准入，历史结论见 [TASK-LOOP-003 摘要](../archive/task-loop-003-l2-proposal-admission.md)。
- 旧手册曾把公开仓指向历史私有 Home；该 Home 的 35 份 v2 + 五份 v1 已由固定 Backup 逐字节证明，正式公开 `deeptrail-open-loop` 未发生 Cohort 回退。
- `BUG-20260718-001` 已实现版本化证明清单和 Doctor/Cohort 共享校验器，不补写、删除或迁移原证据；未知 v1 继续失败关闭。
- `REQ-LOOP-003` 采用 L3A/L3B/L3C 分段模型；L3A 引擎只实施隔离凭据 Runtime/Worktree、固定 Patch/Profile、Commit 和机器人 Draft PR，Policy 默认关闭。

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

完成全量本地门禁并由机器人机制创建受保护 Draft PR；人工批准合入后，用独立 activation PR 绑定批准/合入 Revision 与 Cohort 摘要，再执行免费 L3A 试点。
