# ADR：以分阶段权限模型推进 Loop L3

- 状态：Accepted；L3A 已验收，L3B activation 已终止，人工 Merge 保持唯一合入门禁
- 日期：2026-07-18
- 关联：`REQ-LOOP-003`、`REQ-LOOP-004`、`REQ-LOOP-005`、`REQ-LOOP-006`

## 背景

L2 已能从脱敏 Outcome 生成 Proposal，但不能修改工程事实。直接开放任意 Agent Shell、源工作树写入、自动合并或部署，会同时破坏 Git 事实源、审批链和恢复能力。工程所有者要求持续推进到 L3，但现有完整生产放行与独立自动部署门禁仍未完成。

## 决策

L3 按不可越级的权限阶段推进：

| 阶段 | 允许 | 禁止 |
| --- | --- | --- |
| L3A | 隔离 Worktree、固定 Patch、固定 Profile、本地 Commit、新分支、Draft PR | 自动审批、合并、部署、任意 Shell |
| L3B | L3A + 必需检查和人工批准后的受控合并 | 绕过保护、force-push、自动部署 |
| L3C | L3B + 不可变制品和专项批准后的受控部署 | 现场改码、移动 Tag、无回滚部署 |

`REQ-LOOP-003` 只激活 L3A，交付证据见 [L3A 摘要](../archive/task-loop-004-l3a-controlled-execution.md)。L3B 默认关闭 Engine 已由 PR #43 合入，但 activation PR #44 关闭未合入，路线结论见 [TASK-LOOP-006 摘要](../archive/task-loop-006-l3b-controlled-merge.md)。`REQ-LOOP-006` 仅由 PR #46 交付只读 Issue 准入，后续自动提单与 PR 生命周期已暂停；L3C 仍须独立提供证据。

## L3A 不变量

- Policy 默认关闭；activation 必须绑定最终批准 Head、其 main 合入 Revision、稳定 L2 Cohort 摘要和可远程核验的所有者 Review。
- ChangePlan 字段精确，Patch 与计划同目录且 Hash 固定；路径、文件类型、增删行和运行预算不可静默放宽。
- Mutation Root 位于仓库、Loop Home 与 Backup Root 之外；规范源工作树在前后均保持同一 Commit、Tree 和状态。
- Worker 不能修改 `scripts/`、工程治理文档、`.github/`、部署、数据库迁移、依赖清单、Secret 或生产配置；Profile 使用空 Home/AppData、离线依赖和禁用 lifecycle scripts。
- Stage 与 Publish 分离；失败不删除 Worktree、远程分支或 PR，不伪造 Receipt。

## 结果

该方案让自动修改具有明确爆炸半径和可恢复现场，代价是需要固定输入、Profile 与人工合并。它不是无人值守生产自治；后续自主化不得把任务入口或 PR 维护能力推导为自动合并或部署。

## 拒绝方案

- 在规范源工作树直接改码：会污染事实源，拒绝。
- 让模型执行任意 Shell 或自行扩大路径：不可审计，拒绝。
- 自动批准自己的 PR、绕过 Required Checks 或管理员合并：破坏治理，拒绝。
- 失败后自动删 Worktree/分支/PR：抹除现场，拒绝。
