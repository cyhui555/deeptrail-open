# TASK-GIT-001 合并后回收执行计划

- 状态：G3（本地门禁已通过，等待机器人 Draft PR）；Requirement：`REQ-LOOP-006`；[Work Item](../issues/task-git-001-post-merge-gc.md)；周期：2026-07-19 起

## 成功定义

1. 同一命令以 GitHub PR 事实与本地 Git/worktree 事实生成确定性计划，默认零写。
2. apply 只能执行计划中已通过门禁的短期引用，并生成不含凭据或 PR 正文的本地 Receipt。
3. 合并事务、生产发布和 Issue 验收不依赖 GC 成功。

## 实施阶段

G0 绑定 GitHub #54、Requirement、范围与恢复方式；G1 实现严格参数、事实收集、纯计划器和显式 apply；G2 覆盖 dry-run、squash、别名、worktree、SHA 漂移、OPEN PR 与部分失败；G3 通过全门禁并创建绑定 `Closes #54` 的机器人 Draft PR，等待人工合并。

## 风险与恢复

- PR body 与分支名是不可信输入，只做长度、字符、前缀和 SHA 校验，不进入 shell。
- 默认只删除 PR head 与严格审计 Source；其他同 SHA 别名只报告，必须显式列入。
- apply 逐项记录 before SHA、动作和结果；失败不重试未知写入，先依据 Receipt 只读恢复。
- 回退代码不会恢复已删引用；恢复必须显式把 Receipt SHA 重建为原分支名。
