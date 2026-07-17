# 深迹工程约定

## 语言与注释

- 用户沟通、产品文档、技术文档、测试报告和变更记录默认使用简体中文。
- 新增或修改的关键业务注释使用简体中文，说明原因、约束和失败处理。
- 代码标识符、协议字段、命令、路径、错误原文和第三方专有名词保持原文。

## 架构边界

- 使用 pnpm workspace 和 Turborepo 统一编排工程任务。
- `apps/web` 是 Next.js 移动优先 Web/PWA，不直接访问数据库或模型供应商。
- `apps/server` 是 Spring Boot 模块化单体，控制器只处理协议，业务规则进入 Service。
- `database` 是数据库结构和迁移的事实源；运行时由 Maven 将其打包到 Server classpath。
- `packages/config` 保存跨工具的静态工程配置，不保存运行时密钥。
- `tests/e2e` 保存跨 Web/API 的 Playwright 测试。
- `evals` 保存 AI/外部能力的可重复评测入口，默认评测不得调用真实付费服务。

## 强制规则

- 每项工作先读取 `docs/memory/project-state.md`，并按 `docs/process/p0-method.md` 完成 G0 至 G3。
- 用户要求“提交 Issue”或“提交 Bug”时，默认完成 GitHub Issue、本地 Work Item/看板、适用文档检查、范围内 `git commit` 以及安全推送与合并，无需逐次确认；只提交该 Issue 相关文件，直接合入主干例外期使用 fast-forward 推送，否则通过满足必需检查的 Pull Request 合并，不自动部署。
- 复杂、跨工作区或长时任务必须在 `docs/plans` 建立并持续更新 ExecPlan。
- 功能和 Bug 必须关联 Requirement、Task 或 Bug ID，并提供可验证验收标准。
- 文档遵守 `docs/process/documentation-governance.md`：当前事实只写一处，关闭的详细记录压缩到 `docs/archive`，不得复制可生成契约或长日志。
- 查找优先使用 `rg --files`/`rg`，修改使用可审阅补丁；不得用清空、重置或递归删除处理脏工作区。
- 命令从仓库根目录通过 pnpm 入口执行；真实外部服务验证必须显式说明范围、成本和结果。
- 所有用户数据访问必须校验用户归属；公开 DTO 与内部实体不得混用。
- AI 输出、地图坐标和外部内容进入业务状态前必须完成结构、范围和归属校验。
- 不在源码、日志、测试夹具、Markdown 或 Git 中写入真实密钥和真实用户资料。
- 不提交 `.env`、SQLite 数据、上传文件、日志、依赖缓存、构建产物或测试报告。
- 不在迁移或功能任务中顺带升级框架主版本。
- 不创建、安装或加载项目 Skill；候选能力必须先独立评估。

## 验证命令

- 安装依赖：`pnpm install --frozen-lockfile`
- 文档检查：`pnpm docs:check`
- 静态检查：`pnpm lint`、`pnpm typecheck`
- 默认测试：`pnpm test`
- 后端完整门禁：`pnpm verify:server`
- 后端 E2E：`pnpm test:e2e:server`
- 前端冒烟：`pnpm test:e2e:smoke`
- AI 基线评测：`pnpm eval`
- 生产构建：`pnpm build`

任何检查未执行或失败时，不得声明对应门禁已通过。

## 工程记忆

- 本工程的中央记忆位于 `E:/deep/deepbarin/local-llm-wiki/engineering-memory/projects/deeptrail/`。
- 开始任务时先读取中央 `shared/rules.md`，再依次读取 `manifest.yaml`、本地 `docs/memory/project-state.md` 和中央 `project-state.md`；仅按当前任务范围检索处于“生效”状态的共享模式与反模式。
- 工程源码、正式文档、Schema、测试和已接受 ADR 是事实源；中央记忆只保存恢复摘要与索引。
- Work Item、ExecPlan、ADR 和验收报告保存在本工程本地；中央 `project-state.md` 只记录路径和当前摘要。
- 当前阶段、阻塞、验证或下一动作变化时更新中央 `project-state.md`；重复或高影响经验更新中央 `lessons.md`。
- 项目经验只有满足中央 `shared/README.md` 的证据与审查门槛后才能晋升；普通同步不得自动提升为共享规则。
- 同步方向默认为 `project-to-center`，不得用中央摘要静默覆盖工程事实。
- 中央共享层不可用时报告 `shared-memory-unavailable`；本地任务可按工程事实源继续，但不得执行中央同步或共享知识生命周期操作。
