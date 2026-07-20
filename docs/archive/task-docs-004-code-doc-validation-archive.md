# TASK-DOCS-004 代码与文档校验归档摘要

- 状态：G3 / Closed
- Requirement：`REQ-DOCS-001`
- 交付：将已合入的 `BUG-20260720-003` Issue/ExecPlan 压缩为一个交付摘要，归档旧密钥轮换状态与被替代的 ExecPlan 独立说明，并把当前发布动作改为执行时解析受保护 `main`。
- 保留：仍待目标环境验收的 `TASK-APP-001`、`BUG-20260720-001/002`、`TASK-RELEASE-004` 继续留在活动上下文；L2 Cohort 绑定的 10 个历史 Work Item 原路径不动。
- 验收：`pnpm governance:check`、lint、typecheck、test 与 Eval 通过；Fresh Server `verify` 684/684、Server E2E 39/39、同一 smoke 编排 16/16、强制 Web/Server 构建和 `git diff --check` 通过。
- 环境说明：默认 smoke 首次只因缺少 Playwright Chromium revision 失败；revision 下载无进展后终止，改用本机 Chrome 执行同一测试集并全绿，临时配置与空锁已删除。
- 边界：未修改产品源码、依赖、CI、权限、运行配置或生产数据；未部署、未调用真实 AI/地图服务，也未改动其他脏 worktree。
- 回滚：回退本任务的文档提交；不回退 PR #74/#75，不改写共享历史或触碰生产环境。
