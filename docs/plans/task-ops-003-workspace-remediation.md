# TASK-OPS-003 工作区事实源与执行闭环整改

- 状态：Ready for Review / G2
- 日期：2026-07-19
- 触发：工程所有者要求整改双仓库歧义、遗留 worktree/分支、状态文档漂移、巡检重试噪声和根目录污染。

## 目标

在不触碰当前移动端未提交成果的前提下，把 `travel-open` 固化为唯一活动事实源，保全后回收已结束的本地开发现场，同步项目事实，收紧生产巡检的一次运行契约，并移除明确的非项目根目录污染物。

## 范围与不变量

- 只回收已证明为主干祖先、squash 等价、重复引用或已有本地归档提交的 worktree/分支。
- `fix/task-app-001-mobile-geo` 的未提交代码、测试和文档保持原样。
- 旧私库 `travel` 的当前未合入分支与唯一备份引用保留，不改写历史。
- 不删除生产巡检历史产品；只压缩未来运行契约和当前记忆。
- 不修改产品代码、不部署、不生成 APK。

## 验证

- 两个仓库分别执行 `git worktree list --porcelain`、`git for-each-ref` 和 `git status --short --branch`。
- 对 squash 分支核对 PR Head、合并提交或树/patch 等价性；脏文档现场先提交到本地 `archive/*`。
- 执行 `pnpm docs:check`、`pnpm work-items:check` 和 `git diff --check`。
- 读取 Loopany 服务端循环配置与近期运行日志，更新任务文件后使用 `loopany edit --dry-run` 和实际读回验证。
- 根目录清理前后核对精确绝对路径和顶层目录清单。

## 回滚

- 工作区路由和事实文档通过反向补丁回滚。
- 旧文档中间态保存在本地 `archive/docs-honesty-pre-pr-20260719`，可随时重新建立 worktree。
- 已删除的合并分支仍可由主干、PR Head/merge Commit 或 Git reflog恢复；旧私库唯一备份引用不删除。

## 当前结果

- 工作区根路由已固定 `travel-open` 为唯一活动事实源，旧 `travel` 默认只读。
- 5 个旧 worktree已回收；11 个冗余本地分支已删除，旧文档中间态保存在本地 `archive/docs-honesty-pre-pr-20260719@f068c3a`。
- 公开仓库遗留远端 release 源分支已在核对 PR #62 为 `MERGED`、Head 为 `df27d34` 后删除。
- 主干看板、Work Item 与项目状态已按 `main@bfc3068`、当前移动端未提交分支和 HTTP WebView 阻塞重新表述；已关闭的 `BUG-20260719-002` 已归档。
- 生产错误晨检已固定 `allowControl=false`，每日 `06:10 Asia/Shanghai`、`runAt` 为空；任务契约禁止同窗口自调度与 callback 补偿链。
- 根目录误生成的 `%SystemDrive%` 缓存副本和空 `NVIDIA Corporation/umdlogs` 已按精确路径删除。
