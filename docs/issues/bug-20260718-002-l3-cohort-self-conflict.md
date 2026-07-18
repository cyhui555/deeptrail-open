# BUG-20260718-002：L3 recorded-operation 与严格 Cohort Recovery 自冲突

- 状态：In Progress / P0
- 优先级：P0
- GitHub：[#38](https://github.com/cyhui555/deeptrail-open/issues/38)
- 关联 Requirement：`REQ-LOOP-003`

## 目标

修复 `l3:preflight` 与 `l3:run-draft` 在自身事务进入 `applying` 且持有 Writer Lock 后调用严格 Cohort 时，被 Recovery 误判为残留写操作的自冲突。不得通过伪造 Cohort、跳过 Recovery 或删除失败现场制造通过。

## 验收

- [x] 首次失败事务进入 `failed`，rejected Receipt 保留；未创建 Worktree、Commit、分支或 PR。
- [x] 只忽略同进程、同 L3 operation、精确 Lock Token/Transaction ID 且 Revision 一致的当前事务。
- [x] 错误 Token、其他 Writer、其他未终结事务和非 L3 operation 继续失败关闭。
- [ ] 修复经机器人作者、人工所有者批准与五项 Required Checks 合入后，原固定 ChangePlan 完成 Draft PR。

## 回滚

回退修复将恢复自拒绝行为，不影响 L2；失败事务、Receipt、Proposal 与试点现场继续保留，禁止手工改写证据。
