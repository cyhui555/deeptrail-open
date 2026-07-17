# 文档、工程记忆与工具约束

## 目标

用最少文档恢复工程事实，避免同一结论在 README、Issue、计划、复盘和中央记忆中重复维护。

## 事实分层

| 内容 | 事实源 | 不应复制到 |
| --- | --- | --- |
| 当前实现与协议 | 源码、配置、Schema、OpenAPI、测试 | 手工接口大全、历史计划 |
| 产品范围与验收 | `docs/requirements/registry.md` | 项目状态的完成清单 |
| 当前执行 | `docs/issues/board.md` 与活动 Work Item；复杂任务加 ExecPlan | 中央记忆正文 |
| 历史交付 | `docs/archive/` 的压缩索引 | 长期保留每个已关闭 Issue/计划 |
| 当前恢复点 | `docs/memory/project-state.md` | 时间线式周报 |
| 可复用经验 | `docs/memory/lessons.md` | 原始调试日志和聊天记录 |
| 跨工程恢复摘要 | deepbarin `projects/deeptrail/` | 源码、完整 Work Item、验收报告 |

## 生命周期与预算

1. G0 建立一个 Work Item；只有复杂、跨模块或长时任务才建立 ExecPlan。
2. G1/G2 只更新范围、决策、发现和验证，不抄录命令的完整输出。
3. G3 将交付结论压缩到需求注册表或 `docs/archive/`，关闭的详细 Issue/计划不继续常驻。
4. `project-state.md` 只保留阶段、活动项、阻塞、最后验证和一个下一动作，最多 60 行。
5. 单个 Markdown 最多 320 行；手工 API 入口最多 160 行；全部 Markdown 总量最多 3400 行。
6. 原始截图、PDF、日志、测试报告、数据库和生成产物不进入 `docs/` 或工程记忆。

确需突破预算时，必须在活动 Work Item 中说明不可拆分原因，并同步调整自动检查；不得通过关闭检查规避。

## 工具约束

- 查找文件和文本优先使用 `rg --files` 与 `rg`，只读取当前任务所需范围。
- 文件修改使用可审阅的补丁；不使用清空、重置或递归删除处理脏工作区。
- 命令从仓库根目录通过 `pnpm` 统一入口执行，不绕过质量门禁调用内部脚本。
- 密钥只通过环境变量或本机未跟踪配置注入；文档只记录变量名、状态和脱敏结论。
- 默认测试使用确定性替身。真实 AI、地图或其他外部服务必须显式说明成本、范围与结果。
- 不读取或沉淀 `.env*`、`data/`、`log/`、用户媒体、数据库、缓存、依赖和 Agent 私有目录。
- 工具结果只保留可复核摘要与证据路径，不粘贴长日志。

## deepbarin 同步边界

- 同步方向固定为 `project-to-center`，本仓库始终是事实源。
- 中央只维护 `manifest.yaml`、`project-profile.md`、`project-state.md`、`lessons.md` 四类恢复记忆。
- `include` 是事实提取白名单，不是文件复制清单；`exclude` 优先。
- 中央校验失败时报告 `shared-memory-unavailable`，本地工作可继续，但中央写入、激活和共享晋升必须停止。
- 项目 Lesson 不自动晋升为共享规则；只有通过 deepbarin 的候选、试行、批准和生效流程后才跨工程加载。

## 自动检查

运行：

```powershell
pnpm docs:check
```

检查文档预算、记忆目录白名单、已关闭详细工作项残留、敏感值特征和本地 Markdown 链接。`pnpm lint` 会先执行该检查。
