# TASK-LOOP-004 L3A 受控执行交付摘要

- 状态：已完成
- 日期：2026-07-18
- Requirement：`REQ-LOOP-003`
- 覆盖：`BUG-20260718-001`、`BUG-20260718-002`、`TASK-LOOP-004`、`TASK-LOOP-005`
- GitHub：[#33](https://github.com/cyhui555/deeptrail-open/issues/33)、[#34](https://github.com/cyhui555/deeptrail-open/issues/34)、[#38](https://github.com/cyhui555/deeptrail-open/issues/38)

## 交付结论

Loop 已完成 L3A：Worker 只能根据固定 ChangePlan 与 Patch，在项目外隔离 Worktree 运行固定 Profile、创建 Commit、推送新短期分支并由 `github-actions[bot]` 创建 Draft PR。自动审批、合并和部署仍为 `false`，L3B/L3C 不由本交付推导。

## G3 证据

| 门禁 | 结果 |
| --- | --- |
| 历史 Receipt | 40/40：35 v2 + 5 份由固定 Backup 证明的 v1；未知 v1 为 0 |
| 公开 Home | 53/53 v2；无 Writer、无未完成事务 |
| 严格 Cohort | 10 Work Items / 17 Profiles；首次成功、复用与闭环率 100%，边界违规 0；摘要 `0cb0880be966bbda8e9699362cc9ebee64149f5149ff72db4ceca30421ffb431` |
| Engine | PR #36：批准 Head `340e729`，合入 `c81c5cc` |
| Activation | PR #37：受保护合入 `5c0cb33` |
| Recovery 修复 | PR #39：人工批准、五项 Required Checks 通过，合入 `ba4f009`；GitHub #38 已关闭 |
| 真实试点 | Draft PR #40：机器人作者，Head `0f5f790`，仅新增 `docs/product/l3a-draft-pilot.md` 五行 |
| 事务 | preflight `20260718040552-aad013b6-4cef-4905-a425-0898d0596ef2`；run-draft `20260718040628-ff804a85-c1e4-4351-a4e0-477efa6b9ded` |
| 验证 | Loop 25/25、真实 Runtime 1/1、治理与 17 项公开安全测试、lint、typecheck 和 PR #39 远程 CI 通过 |

## 失败恢复与边界

- 首次真实 preflight 的自冲突事务安全进入 `failed`，rejected Receipt 保留，未创建 Worktree、Commit、分支或 PR。
- Recovery 只识别同进程、同仓库、同 L3 operation、精确 Lock Token/Transaction ID 且 Revision 一致的当前事务；其他 Writer 或残留事务继续失败关闭。
- 规范源工作树在真实试点前后保持 `main@ba4f009`、Tree 与 clean 状态不变；失败现场和远端证据不自动删除。
- PR #40 保持 Draft；run `29630029767` 的零 Job `action_required` 留给人工处理，自动化不代批、转 Ready、合并或部署。

## 后续

L3B 后续结论见 [TASK-LOOP-006 终止摘要](task-loop-006-l3b-controlled-merge.md)；人工 Review/Merge 保持唯一合入门禁，L3C 由 `REQ-LOOP-005` 另行准入。
