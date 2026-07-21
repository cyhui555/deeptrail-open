# 执行看板

- 最近更新：2026-07-21
- WIP 上限：1 个产品主任务；会创建源码或 PR 的维护循环默认暂停

## In Progress

当前没有活动产品主任务。`TASK-APP-001` 及其真机反馈子项已经人工验收并关闭，产品 WIP 已释放；下一轮候选仍需由工程所有者单独准入。

## Operational Follow-up（不占用产品 WIP）

- [`TASK-RELEASE-004`](task-release-004-remote-artifact-chain.md)：远程不可变制品链已合入，仍等待两项 Web 构建配置与首次真实运行；不部署。

## Paused / Archived

- `TASK-APP-001` 与 `BUG-20260720-001/002` 已完成 Android 功能人工验收并关闭，交付与边界见[Android 基础切片验收摘要](../archive/task-app-001-android-acceptance.md)。
- React Doctor Daily（`loop-mrqhdf3j-90f66952`）与 Housekeeper Daily（`loop-mrric1do-f5aff447`）已设置 `enabled=false`；历史与恢复条件见 [TASK-LOOP-008](../archive/task-loop-008-react-doctor-daily-trial.md) 和工作区 Loopany 任务文件。
- `TASK-DOCS-004` 已完成代码/文档校验与历史记录压缩，结论见[归档摘要](../archive/task-docs-004-code-doc-validation-archive.md)。
- `BUG-20260720-003` 已由 PR #75 受检合入，修复交付结论见[小红书链接导入修复摘要](../archive/bug-20260720-003-xiaohongshu-url-ingestion.md)；部署与历史任务重算不属于该 Bug 的交付范围。
- `BUG-20260719-002`、`TASK-OPS-003`、治理试验、Loop L0—L3 与各里程碑均从活动看板移出，统一从[历史归档导航](../archive/README.md)按需取证。
- L2 Cohort 的 10 个关闭 Work Item 因不可变合同保留原路径，由 `scripts/loop/l2-cohort.json` 索引；它们不是活动任务。

## Review Queue

当前没有开放的产品 Review 项；新候选必须由工程所有者重新准入。
