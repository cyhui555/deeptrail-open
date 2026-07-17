# TASK-LOOP-003：Loop Engineering L1 Phase 2 与 L2 Proposal-only 准入

- 状态：Verification / G2
- 优先级：P0
- Owner：工程所有者
- 关联 Requirement：`REQ-LOOP-002`
- ExecPlan：[L1 Phase 2 执行计划](../plans/task-loop-003-l1-phase2-exec-plan.md)
- 基线：`main@4d30a83`
- 最近更新：2026-07-17

## 目标

恢复并持续守住 LoopAny 固定 Runtime 的确定性闭环，完成 CI、可复现 Profile、Release Outcome 和至少 10 个真实工程工作项的 Shadow 审计，使工程具备 L2 Proposal-only 准入证据。

## 范围

### 范围内

- 修复归档后失效的 Runtime 集成夹具。
- 将文档、Loop 单测、Eval 和状态一致性接入 CI。
- 固定质量 Profile 的工具链、环境、命令、权限和预算。
- 扩展确定性 AI Eval 与脱敏 Release Outcome 合同。
- 完成 M0—M4 验证和 L2 Proposal-only 准入评审。

### 范围外

- 不自动修改业务源码、远程 Git、服务器或生产配置。
- 不 vendor、分发或自动升级 LoopAny。
- 不读取真实用户数据、Prompt、模型原始响应、数据库或媒体。
- 不进入 L3 自动分支、PR、合并或部署。
- 不顺带升级框架主版本。

## 不变量

- Git 工程事实优先于 Loop Artifact。
- 第二 Writer、Revision/Hash 漂移、未知事务阶段和未授权操作失败关闭。
- `verified` 必须同时具备完整 Evidence、Outcome、Receipt 和 Postcheck。
- L2 只能生成结构化 Proposal，必须由人工决定是否转成 Work Item。
- 失败可以终结；不可判定事务和假绿不可接受。

## 验收标准

- [x] `pnpm loop:test` 与固定 Runtime 集成测试全部通过，夹具不依赖真实活动 Work Item。
- [x] Doctor 通过，Recovery 无 Writer 和未终结事务，Backup/隔离 Restore 可验证。
- [x] Governance/Loop CI 检查覆盖文档、Loop、Eval 和状态一致性。
- [x] Server/Web/Smoke Profile 的工具身份、环境白名单、预算和验收条件进入 ExecutionSpec。
- [x] 未预期进程错误不能以退出码 0 形成 Shadow `verified`。
- [x] Eval 覆盖合法/非法结构、空结果、截断、超时、取消和降级边界。
- [x] Release/Commit/制品与脱敏 Outcome 可以关联，不保存用户内容。
- [x] 至少 10 个已提交真实工程 Work Item 完成 Shadow 审计，闭环终结率 100%、边界违规率 0。
- [x] L2 Proposal Schema、权限禁令、人工审批和失败回退通过验收。
- [x] 适用 lint、typecheck、测试、构建、E2E 与文档门禁通过。

## 回滚

- 任一里程碑失败时停止等级提升，保留失败 Evidence 和 Outcome，不删除现场或改写 Receipt。
- 代码变更按范围回退到本任务基线；不移动正式 Tag、不改写共享历史。
- Loop Workspace 仅通过已验证 Backup 在新隔离目录 Restore，不覆盖活动 Workspace。
- L2 试点异常时关闭 Proposal Profile；L1 只读 Profile 和工程质量门禁继续保留。

## 文档预算说明

本任务跨 Gateway、CI、Server、Web、Eval 与运行治理，必须维护一个自包含 ExecPlan。建立计划前 `docs/` 已为 2997/3000 行，因此本活动 Work Item 批准将总预算调整为 3400 行；单文档 320 行限制不变。G3 必须压缩过程记录并重新核对总预算。

## 下一项唯一动作

GitHub Free 脱敏公开主仓和单维护者受保护合并链已由 PR #22 实证，`TASK-GOV-001` 已关闭；PR #23 及第 4 项 `TASK-CI-001` Shadow 证据已完成。下一步合入三个真实 Full E2E 失败簇并预登记第 5–7 项，随后完成两个既有 Bug 的发布复验和其余 3 项真实样本。
