# TASK-LOOP-004 L3A 执行计划

- 状态：G3 activation
- Requirement：`REQ-LOOP-003`
- Work Item：[TASK-LOOP-004](../issues/task-loop-004-l3a-controlled-execution.md)
- 前置 Bug：[BUG-20260718-001](../issues/bug-20260718-001-legacy-receipt-v1-integrity.md)
- 周期：2026-07-18 起，完成受保护合并与首个试点后收口

## 成功定义

1. 不改写历史证据即可恢复 Doctor 与严格 Cohort 一致为绿。
2. L3A 只在项目外隔离 Worktree 写入，并从固定 Patch 产生可追溯 Commit 与 Draft PR。
3. 源工作树、生产、数据库、依赖、CI 和审批边界不被 Worker 修改。
4. 任一漂移、越界、失败或中断均保留现场并终止，不伪造通过。

## 实施阶段

### P0：Receipt 兼容

- 固定五份 v1 Receipt 的文件 Hash、Backup ID、Payload 与 Manifest 摘要。
- 抽取共享 Receipt 集合校验器；Doctor/Cohort 同时接入。
- 覆盖已证明 v1、未知 v1、文件漂移、Backup 漂移和 v2 篡改。

### P1：L3A 合同

- 建立默认禁用的 Policy 和严格 ChangePlan Schema。
- 固定允许 Profile、目录白名单、禁区、Patch/文件/行数/输出/时长预算。
- 将最终批准 Head、main 合入 Revision、稳定 Cohort 摘要与可远程核验的所有者 Review 绑定到 activation。

### P2：隔离执行

- 在显式 Mutation Root 创建 detached Worktree，检查 Patch 后一次性应用。
- 只运行固定 pnpm Profile 和公开安全检查；验证后要求 Worktree clean。
- 创建本地 Commit；Stage 与 Publish 分离，远程只允许新短期分支和 Draft PR。

### P3：验证与发布

- 单测与真实 Runtime 集成覆盖失败恢复和源工作树不变。
- 完成 docs、governance、security、Eval 与适用质量门禁。
- 通过机器人机制作者或受控发布路径建立 Draft PR，等待人工所有者审批。
- 合入后执行免费试点；L3B 自动合并与 L3C 自动部署保持阻断。

## 验证矩阵

| 层 | 命令或证据 |
| --- | --- |
| 文档/治理 | `pnpm docs:check`、`pnpm governance:check` |
| Loop | `pnpm loop:test`、`pnpm loop:test:integration` |
| L2 | `pnpm loop:doctor`、`pnpm loop:cohort:l2:strict` |
| L3A | Policy/Plan 单测、隔离 Worktree 集成、Draft PR 远程复核 |
| 工程质量 | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm eval`、`pnpm build` |

## 风险与恢复

- 旧证据只通过已版本化 Backup 基线证明，不补写自证 Hash。
- L3A Patch 不允许改自身策略与执行器，避免一次变更同时扩大权限并使用权限。
- 网络失败后保留本地 Commit/Worktree；重试发布前复核 Commit、分支和 PR 状态。
- 无独立人工批准时最多停在 Draft PR，不自动合并或部署。

## 进度与发现

- [x] 复现严格 Cohort 失败并定位五份 schema v1 Receipt。
- [x] 五份当前文件与既有 Backup SHA-256 全部一致。
- [x] 登记 GitHub #33、#34 和受保护短期分支。
- [x] 实现 Receipt 证明链；确认公开严格 Cohort 49/49 v2、10/10 Work Items 通过。
- [x] 实现默认关闭的 L3A Policy、Plan、隔离凭据 Runtime、Worktree 与事务回执；Loop 测试 23/23。
- [x] 本地 G2 与远程引擎 PR #36 已完成，受保护主干为 `c81c5cc`。
- [ ] 完成独立 activation PR 与 `TASK-LOOP-005` 免费试点 G3。
