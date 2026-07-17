# TASK-LOOP-002：Loop 工程合同加固交付摘要

- 状态：已完成
- 日期：2026-07-17
- Requirement：`REQ-LOOP-001`
- PR：[cyhui555/deeptrail#19](https://github.com/cyhui555/deeptrail/pull/19)
- 实现 Commit：`153ad2c`
- 合并 Commit：`300c86df`
- 详细验收：[TASK-LOOP-002 验收记录](../verification/task-loop-002-loop-contract-hardening.md)
- 使用手册：[Loop Engineering 本地操作手册](../operations/loop-engineering.md)

## 交付

- 在既有薄 Gateway 上补齐不可变 ExecutionSpec，以及 Task、Run、Execution、Evidence、Outcome、Receipt 可遍历引用链。
- 所有 Gateway 写操作统一使用单写锁、Transaction v2 前序 Hash 链和原子不可变 Receipt；未知状态与摘要漂移失败关闭。
- 对 `prepared/applying/source_committed/postchecking` 提供显式恢复，覆盖半提交与硬中断残留锁，不自动猜测重放。
- 固化 Clean Worktree、已提交 Work Item、固定 Profile、命令数、时长、输出、尝试次数、环境脱敏和远程写禁令。
- 支持 15→17 Kind 兼容升级；升级前自动 Backup，并提供逐文件 SHA-256 Manifest 与只写新目录的隔离 Restore。
- 固定 LoopAny Commit、Bun、CLI 和 19 文件 Skill Manifest；日常操作、恢复、Backup/Restore 与停止条件均有可复制 PowerShell 手册。

## 验收

- Gateway 单测 12/12；最终实现真实 Runtime 集成 1/1，覆盖四阶段故障、半提交、残留锁、兼容升级、Backup/Restore、幂等和篡改拒绝。
- 根 `lint`、`typecheck`、`test`、`build` 与 `docs:check` 通过；Server 647 项测试通过。
- 活动 Workspace 已从 15 升级为 17 Kind；34 个 Artifact、69 条引用有效，固定 Skill 19 文件，Doctor 全部通过。
- 升级前 Backup `backup-20260716194349-ceed4e4c9841` 已在新目录完成旧版 Restore + Doctor；活动 Workspace 无 Writer 或未终结事务。
- PR #19 的 Backend E2E、Backend quality、Frontend quality/Eval 与 Frontend smoke 全部通过；完整前端 E2E 按工作流条件跳过。

## 最终判定与边界

- L0 LoopAny 记忆侧车：`PASS`。
- L1 Phase 1 确定性只读执行控制闭环：`PASS`。
- 业务反馈闭环、治理进化闭环、L2/L3 与完整生产放行：`NOT READY`。
- LoopAny 上游许可明确前不 vendor 或分发；主干保护、权限专项评审和强沙箱通过前不启用 Loop 自动 PR/Merge。
- Git 仓库继续作为工程事实源；Loop Home、Backup、Restore 和 Receipt 只保存工程控制 Artifact，不写入业务数据库、媒体、`.env` 或真实用户数据。
