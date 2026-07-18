# TASK-LOOP-008 Work Item 草案执行计划

- 状态：G3 / Ready for Review
- Requirement：`REQ-LOOP-006`
- Work Item：[TASK-LOOP-008](../issues/task-loop-008-work-item-proposal.md)

## 成功定义

1. Intake 与草案生成分层：普通判定仍不返回正文，草案命令只对 `executable` Issue 生成不透明 Base64 载荷。
2. 稳定 ID、Requirement、目标路径、四段数据和摘要均由确定性函数生成，重复运行字节一致。
3. 仓库、预算、重复 ID、归档 ID或输入形态漂移时无文件、Git、PR 和 Loop Home 写入。

## 实施阶段

1. G0：归档 TASK-LOOP-007，锁定公开 Issue 仓与 Proposal-only 权限。
2. G1：实现草案规范化、Requirement/ID/现有 Work Item 校验和只读 CLI。
3. G2：覆盖成功、重复运行、非可执行、重复/归档、预算与注入形态回归。
4. G3：运行完整适用门禁，以机器人作者 Draft PR 交付并等待人工 Review/Merge。

## 验证

- `pnpm loop:test`、`pnpm docs:check`、`pnpm work-items:check`、`pnpm governance:check`。
- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm eval`、`pnpm build`；不调用真实 Provider 或生产环境。

## 风险与恢复

Issue 正文是不可信数据；渲染器只引用固定章节，输出 Base64 与 Hash，后续 Writer 必须按字节处理。任何异常均停止且不生成远端状态；删除本增量即可回到 TASK-LOOP-007 的只读判定能力。
