# TASK-GIT-001：建立合并后分支与 worktree 回收阶段

- 状态：待评审 / G3；优先级：P1；GitHub：[#54](https://github.com/cyhui555/deeptrail-open/issues/54)；[ExecPlan](../plans/task-git-001-post-merge-gc-exec-plan.md)
- 关联 Requirement：`REQ-LOOP-006`

## 目标

在人工 Review/Merge 边界不变的前提下，新增独立 Post-merge GC：默认只读报告，只有绑定已合并 PR 与完整 head SHA 的显式批准才允许回收短期远端分支、本地分支和 clean linked worktree。

## 验收标准

1. dry-run 不写 Git、GitHub、worktree 或 Receipt，并列出 PR head、审计 Source、同 SHA 别名与阻塞原因。
2. apply 必须绑定 PR 编号和完整 head SHA；OPEN PR、dirty/current worktree、受保护分支、SHA 漂移与未知对象失败关闭。
3. squash merge 依据 GitHub PR head/merge 元数据判断，不依赖 `git branch --merged`。
4. 删除按 worktree、本地 branch、远端 branch 顺序执行；部分失败记录 Receipt，但不影响既有 merge。
5. 单测、文档、治理与安全门禁通过；不自动审批、合并、部署或关闭业务 Bug。

## 验证结果

GC 专项 8/8、安全 25/25 及 `governance:check`、`lint`、`typecheck`、`test`、`build` 全部通过。真实 dry-run 对 PR #50 零写入，识别 2 条候选分支、1 条同 SHA 人工复核别名，并因调用工作树非 clean/非实时 `main` 失败关闭。

## 范围外

不批量删除历史分支，不修改 L3B merge transaction 或启用 GitHub 自动删分支，也不删除 detached 发布证据、dirty worktree、OPEN PR 分支或 `archive/*` 引用。

## 回滚

移除 GC 命令和文档即可；已删除 Git 引用只能从 Receipt 中的固定 SHA 显式恢复，因此 apply 始终需要人工批准。
