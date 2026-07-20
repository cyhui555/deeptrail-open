# 执行看板

- 最近更新：2026-07-20
- WIP 上限：1 个产品主任务；会创建源码或 PR 的维护循环默认暂停

## In Progress

- [`TASK-APP-001`](task-app-001-android-basic.md)：Android 基础 APK 与真机反馈修复已分别由 PR #65/#67 合入；当前只做受控部署与 360px/390px 真机复验。
- [`BUG-20260720-001`](bug-20260720-001-geocoding-qps-cascade.md)：5 QPS 限流级联修复已随 PR #67 合入，等待脱敏规划任务验证实际坐标补全率；作为 `TASK-APP-001` 子项，不新增并行 WIP。

## Operational Follow-up（不占用产品 WIP）

- [`TASK-RELEASE-004`](task-release-004-remote-artifact-chain.md)：远程不可变制品链已合入，仍等待两项 Web 构建配置与首次真实运行；不部署。

## Paused / Archived

- React Doctor Daily（`loop-mrqhdf3j-90f66952`）与 Housekeeper Daily（`loop-mrric1do-f5aff447`）已设置 `enabled=false`；历史与恢复条件见 [TASK-LOOP-008](../archive/task-loop-008-react-doctor-daily-trial.md) 和工作区 Loopany 任务文件。
- `BUG-20260719-002`、`TASK-OPS-003`、治理试验、Loop L0—L3 与各里程碑均从活动看板移出，统一从[历史归档导航](../archive/README.md)按需取证。
- L2 Cohort 的 10 个关闭 Work Item 因不可变合同保留原路径，由 `scripts/loop/l2-cohort.json` 索引；它们不是活动任务。

## Review Queue

当前没有开放的产品 Review 项；新候选必须由工程所有者重新准入。
