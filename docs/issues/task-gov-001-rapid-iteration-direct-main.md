# TASK-GOV-001：快速迭代期直接合入主干

- 状态：Verification
- 创建时间：2026-07-17
- 负责人：工程所有者
- 关联规则：`RULE-002`、`process/branch-release-standard.md`
- 失效条件：`v0.3.0` 进入功能冻结或 2026-08-17，以先到者为准

## 决策

本例外仅用于旧私有主干和新公开主仓的两次 Bootstrap Push。公开 `main` 已启用管理员守规、独立 Review 与五项 Required Checks，本例外不再授权后续直推。

## 约束与等价控制

- 每个提交保持单一目标并关联 Work Item、Bug 或治理 ID；不得把无关脏工作区一起提交。
- 工程所有者已长期授权“提交 Issue/提交 Bug”流程在创建 GitHub Issue、登记本地 Work Item/看板并通过适用文档检查后，直接提交、推送并合并范围内 Git 变更，无需逐次确认；本例外有效期内使用 fast-forward 推送 `main`，例外失效后通过满足必需检查的 Pull Request 合并，该授权不包含自动部署。
- 推送前执行与风险匹配的文档、lint、typecheck、测试、构建或 Eval；未运行项必须如实记录。
- 只允许 fast-forward 推送；禁止 force-push、改写共享历史、删除或移动正式 Tag。
- GitHub Actions 失败时停止版本晋升并优先修复；正式 Tag 只能指向通过适用门禁且属于 `main` 的提交。
- Secret、数据库、日志、用户资料、媒体、缓存和生成产物继续禁止进入 Git。
- 生产发布、破坏性迁移或高风险安全边界变更仍需逐项记录风险、回滚和验收证据；工程所有者可随时要求恢复 PR Review。

## 验收与退出

- 公开 `main@9f67fe3` 的五项远端 CI 已通过且保护规则已读回；首个独立 Review PR 合并后关闭本工作项。
- 到达失效条件时关闭本工作项，恢复 `RULE-002` 的短期分支与 Pull Request 默认流程；不得静默延长。
