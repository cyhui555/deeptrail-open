# 当前项目状态

- 最后核对：2026-07-18
- 当前阶段：L2 历史准入已完成；因五份 v1 Receipt 兼容缺口按规则暂退 L1，正在恢复严格 Cohort 并实施 L3A
- 当前检查门：公开 `main@020638c` 与远端一致、CI 成功；Loop 单测 17/17、静态 Cohort 10/10、Doctor 通过，但严格 Cohort 当前失败关闭
- 活动工作项：`BUG-20260718-001`、`TASK-LOOP-004`、`TASK-RELEASE-003`、`TASK-OPS-002`
- 最近完成：`TASK-LOOP-003`、`TASK-GOV-001`、`TASK-WORKSPACE-001`、`TASK-LOOP-002`、`TASK-LOOP-001`

## 当前事实

- 旅迹产品 M0—M16、后台运营第一期和 v0.2.0 不可变目标环境发布已交付；详细历史位于 `docs/archive/`。
- LoopAny 固定为 `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`、CLI `0.2.0`、Bun `1.3.14`，使用项目外 Workspace、单写锁、Transaction v2、Receipt、Backup/隔离 Restore 与固定 Profile。
- `REQ-LOOP-002` 已以 PR #22—#32、公开 Cohort 10/10、目标机断网回归和不可变 Release/恢复完成 L2 Proposal-only 准入，历史结论见 [TASK-LOOP-003 摘要](../archive/task-loop-003-l2-proposal-admission.md)。
- 2026-07-18 现场复核发现 39 份 Gateway Receipt 中五份为 v2 引入前生成的 schema v1；当前文件与 Backup `backup-20260716194349-ceed4e4c9841` 的 SHA-256 全部一致。
- `BUG-20260718-001` 将以版本化 Backup 证明清单兼容这五份文件，不补写、删除或迁移原证据，并使 Doctor/Cohort 共用校验器。
- `REQ-LOOP-003` 采用 L3A/L3B/L3C 分段模型；当前只实施隔离 Worktree、固定 Patch/Profile、Commit 和 Draft PR。

## 当前约束

- 禁止直推 `main`；变更经机器人机制作者或受控短期分支 PR、人工所有者审批和五项 Required Checks 合并，不自动部署。
- L3A 不能修改规范源工作树、Loop Gateway 自身、CI、部署、数据库迁移、依赖清单、Secret 或生产配置。
- 自动审批、自动合并与自动部署保持关闭；L3B/L3C 必须有独立 Requirement、准入证据和人工批准。
- 默认验证使用本地确定性替身，不读取用户数据，不调用真实付费 Provider。
- 完整生产放行仍缺 TLS、凭据轮换、远程制品链、独立介质 Restore 和正式回滚演练；不得由 L3A 推导放行。

## 最后验证

- `pnpm loop:test`：17/17；`pnpm loop:cohort:l2:static`：登记/Evidence 10/10。
- `pnpm loop:doctor`：无 Writer、无未终结事务，固定 Runtime/Skill/Kind 与 Workspace 有效。
- `pnpm loop:cohort:l2:strict`：`RECEIPT_TAMPERED`，定位为五份未带 v2 自摘要的历史 schema v1 Receipt。
- 既有 Backup Manifest、Payload 与五份当前 Receipt Hash 逐项一致；未观测到 Backup 后文件漂移。

## 下一项唯一动作

完成 `BUG-20260718-001` 的证据保全兼容并重新通过严格 Cohort；随后执行 `TASK-LOOP-004` L3A 隔离 Draft PR 免费试点。
