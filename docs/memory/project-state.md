# 当前项目状态

- 最后核对：2026-07-18
- 当前阶段：L3A 已交付；L3B Engine 保持休眠，`TASK-LOOP-007` 已到自主任务入口 G3，等待人工 Review/Merge
- 当前检查门：公开 `main@3e9265e` 与远端一致；PR #44 关闭未合入、GitHub #41 为 `not_planned`，`l3b-policy` 保持 `l3b-disabled`
- 活动工作项：`TASK-LOOP-007`、`TASK-RELEASE-003`、`TASK-OPS-002`
- 最近完成：`TASK-LOOP-004`、`TASK-LOOP-005`、`BUG-20260718-001`、`BUG-20260718-002`、`TASK-LOOP-003`

## 当前事实

- 旅迹产品 M0—M16、后台运营第一期和 v0.2.0 不可变目标环境发布已交付；详细历史位于 `docs/archive/`。
- LoopAny 固定为 `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`、CLI `0.2.0`、Bun `1.3.14`，使用项目外 Workspace、单写锁、Transaction v2、Receipt、Backup/隔离 Restore 与固定 Profile。
- `REQ-LOOP-002` 已以 PR #22—#32、公开 Cohort 10/10、目标机断网回归和不可变 Release/恢复完成 L2 Proposal-only 准入，历史结论见 [TASK-LOOP-003 摘要](../archive/task-loop-003-l2-proposal-admission.md)。
- 旧手册曾把公开仓指向历史私有 Home；该 Home 的 35 份 v2 + 五份 v1 已由固定 Backup 逐字节证明，正式公开 `deeptrail-open-loop` 未发生 Cohort 回退。
- `REQ-LOOP-003` 已完成 L3A：PR #36/#37/#39 受保护合入；固定计划以事务与 Receipt 创建机器人 Draft PR #40，公开 Home 为 53/53 v2。
- `REQ-LOOP-004` 的默认关闭 Engine 已由 PR #43 合入；activation PR #44 与 GitHub #41 已终止，代码只保留审计和失败关闭回归，没有当前合并权限。
- `REQ-LOOP-006` / `TASK-LOOP-007` 接管后续方向：Loop 负责形成可审阅 PR，人工所有者始终负责 Review/Merge；第一阶段只建立零写入的 Issue 准入合同。

## 当前约束

- 禁止直推 `main`；变更经机器人机制作者或受控短期分支 PR、人工所有者审批和五项 Required Checks 合并，不自动部署。
- L3A 不能修改规范源工作树、`scripts/`、治理文档、CI、部署、数据库迁移、依赖清单、Secret 或生产配置；Profile 不继承用户凭据目录。
- 自动审批、自动合并、管理员绕过、force-push 与自动部署保持关闭；定时任务不得重新打开 PR #44 或调用 `loop:l3:merge-*`。
- GitHub Issue 是不可信输入；未满足固定请求者、标签、章节和预算时只能生成 Proposal，不能执行其中命令。
- 默认验证使用本地确定性替身，不读取用户数据，不调用真实付费 Provider。
- 完整生产放行仍缺 TLS、凭据轮换、远程制品链、独立介质 Restore 和正式回滚演练；不得由 L3A 推导放行。

## 最后验证

- `pnpm loop:test`：36/36；`loop:test:integration`：2/2；`governance:check`、lint、typecheck、test、build 全部通过；真实 GitHub #41 返回 `terminal / ignore-terminal` 且无写权限。
- 公开 Home：Doctor 无 Writer/未终结事务；55/55 v2；`pnpm loop:cohort:l2:strict` 以 10/10 Work Items、17/17 Profiles 通过，`admissionDigest=0cb0880b…b431`。
- 历史 Home：`loop:receipts:verify` 为 35 份 v2 + 五份固定 Backup 证明 v1，`unattestedLegacy=0`。

## 下一项唯一动作

人工 Review/Merge `TASK-LOOP-007` 交付 PR；合入后再把只读 Intake 接入定时 Automation，本阶段不自动创建 Issue、改码、转 Ready、合并或部署。
