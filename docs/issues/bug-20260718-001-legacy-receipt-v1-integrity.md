# BUG-20260718-001：历史 v1 Receipt 阻断严格 Cohort

- 状态：In Progress / G1
- 优先级：P0
- GitHub：[#33](https://github.com/cyhui555/deeptrail-open/issues/33)
- 关联：`REQ-LOOP-002`、`TASK-LOOP-004`

## 失败证据与原因

长期 Loop Home 的 `loop:doctor` 通过，但 `pnpm loop:cohort:l2:strict` 以 `RECEIPT_TAMPERED` 失败。39 份 Receipt 中五份由 Receipt v2 引入前的 schema v1 Gateway 生成，没有 `integritySha256`；它们与 Backup `backup-20260716194349-ceed4e4c9841` 的逐文件 SHA-256 全部一致，属于兼容缺口而非已观测到的运行后漂移。

## 范围与不变量

- 建立版本化、精确到文件 Hash 的 v1 证明清单，并绑定既有 Backup Manifest。
- Doctor 与 Cohort 共用同一 Receipt 集合校验器，报告 v2、已证明 v1 和未知 v1 数量。
- 原 Receipt、事务、Backup 和 Workspace 不改写、不删除、不迁移；未知 v1 或任一 Hash 漂移继续失败关闭。

## 验收

- [ ] 五份已证明 v1 通过，`unattestedLegacy=0`。
- [ ] 未登记 v1、当前文件漂移、Backup 漂移和 v2 篡改均由测试覆盖并失败。
- [ ] `loop:test`、真实 Runtime 集成、Doctor 和严格 Cohort 通过。
- [ ] 修复经受保护 PR 合入，不直推主干。

## 回滚

回退代码与证明清单即可恢复原失败关闭行为；不得回滚或覆盖任何运行态证据。
