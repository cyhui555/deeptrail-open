# TASK-LOOP-006 L3B 执行计划

- 状态：G3（Engine 已合入、独立 activation 准入）
- Requirement：`REQ-LOOP-004`
- Work Item：[TASK-LOOP-006](../issues/task-loop-006-l3b-controlled-merge.md)
- ADR：[L3B 受控合并](../architecture/adr-loop-l3b-controlled-merge.md)
- 周期：2026-07-18 起，完成独立 activation 与真实合并试点后收口

## 成功定义

1. 只有精确 Head 的 Required Checks 全绿且人工批准仍有效时，普通 squash merge 才可发生。
2. 合并、竞态判定、超时恢复与幂等 Postcheck 均有 Transaction、Receipt 和远端证据。
3. 自动审批、管理员绕过、force-push、自动部署与生产写入保持禁止。
4. L3A、规范源工作树、分支保护和持续 Cohort 不因 L3B 实现而回退。

## 实施阶段

### P0：合同与事实模型

- 定义默认关闭的 L3B Policy 与严格 MergePlan Schema。
- 固定 PR/Base/Head、L3A Receipt、ChangePlan、Commit、Required Checks、Review 和保护快照。
- 定义 Review 新鲜度、检查结论、合并方法与结果身份的可判定规则。

### P1：只读 Preflight 与合并事务

- 先实现只读远端校验，拒绝 Draft、额外 Commit、路径漂移、旧检查或无效 Review。
- 合并前在同一事务内二次取证，使用非管理员 expected-Head squash merge。
- 合并后绑定 merge commit、main Tree、PR 状态和原 Head；不触发部署或清理。

### P2：恢复与威胁测试

- 覆盖检查 pending/failure/skipped、Review 缺失/驳回/失效和保护规则变化。
- 覆盖 Head/Base 漂移、并发合并、网络超时、响应丢失、重复执行和不一致结果。
- 真实临时远端证明幂等 Postcheck、失败现场保留与规范源零污染。

### P3：受保护准入

- Engine PR 由机器人作者创建，通过全部必需检查并由人工所有者批准。
- 独立 activation PR 只登记最终 Engine/Review/Cohort/保护证据，再次人工批准。
- 权限一次只从 L3A 增加受控 merge；`autoApprove`、`autoDeploy` 继续为 `false`。

### P4：真实试点

- 使用全新的免费、无业务数据文档 ChangePlan，不复用 #40 改写阶段语义。
- 人工转 Ready、审查并批准精确 Head；Loop 只执行最终受控 squash merge。
- 独立核对 main、PR、Receipt、无部署与恢复状态后归档。

## 验证矩阵

| 层 | 命令或证据 |
| --- | --- |
| 文档/治理 | `pnpm docs:check`、`pnpm work-items:check`、`pnpm governance:check` |
| Loop | `pnpm loop:test`、`pnpm loop:test:integration`、新增 L3B 临时远端集成 |
| L2/L3A 回归 | `pnpm loop:doctor`、`pnpm loop:cohort:l2:strict`、L3A preflight |
| 安全 | `pnpm security:test`、公开历史/基线/敏感路径检查 |
| 工程质量 | `pnpm lint`、`pnpm typecheck`、适用测试、Eval 与 build |
| 远端 | Engine/activation/试点 PR 的作者、Review、Checks、Head、merge commit 与保护 API |

## 风险与恢复

- 单一所有者只能证明机器人作者外审批，不能宣称组织级双人复核。
- GitHub API 超时可能发生“已合并但响应丢失”；只读恢复必须先于任何重试。
- 分支保护或 Required Checks 漂移立即失效，不采用缓存结果降级。
- 回退只关闭 activation 或回退未使用的 Engine；不得改写已完成 merge 或自动删除远端现场。

## 进度

- [x] 建立 GitHub #41、Requirement、ADR、Work Item 与 ExecPlan。
- [x] 完成 G1 威胁模型评审与可执行 Schema。
- [x] 完成默认关闭 Engine、32/32 单测、2/2 真实集成与全工程 G2 门禁。
- [x] 完成 Engine PR #43 的机器人作者、精确 Head 人工批准与受保护合入。
- [ ] 完成独立 activation PR 与真实受控合并试点 G3。
