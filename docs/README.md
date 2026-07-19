# 文档导航

工程事实以源码、配置、Schema、测试和下列最小文档集为准。文档不复制可由代码或工具生成的内容。

| 需要了解 | 唯一入口 |
| --- | --- |
| 当前阶段、阻塞与下一动作 | [项目状态](memory/project-state.md) |
| 需求与交付追踪 | [需求注册表](requirements/registry.md) |
| 当前工作项 | [执行看板](issues/board.md) |
| 后续候选规划 | [任务路线图](plans/future-roadmap.md) |
| 历史交付 | [M0–M10](archive/m0-m10-delivery.md)、[M11](archive/m11-delivery.md)、[M12](archive/m12-delivery.md)、[M13](archive/m13-delivery.md)、[M14](archive/m14-delivery.md)、[M16](archive/m16-delivery.md)、[v0.2.0 目标环境发布](archive/task-release-002-production-deployment.md) |
| 可复用工程经验 | [工程经验](memory/lessons.md) |
| API 使用与契约 | [接口入口](api/接口说明书.md) |
| 后端运行 | [后端运行规范](technical/backend-runtime.md) |
| 前端运行 | [前端运行规范](technical/frontend-runtime.md) |
| UI 视觉规则 | [样式规范](technical/style-guide.md) |
| 文档与工具约束 | [文档治理规范](process/documentation-governance.md) |
| 生产部署与回滚 | [单机发布手册](operations/production-deployment.md) |
| 远程不可变制品 | [远程制品链](operations/remote-artifact-chain.md) |
| 服务器配置更新 | [配置更新手册](operations/server-configuration-update.md) |
| Android App 基础切片 | [Android App 手册](operations/android-app.md) |

## 维护原则

- 当前事实只写一处，其他位置使用链接。
- OpenAPI、Schema、类型和测试能表达的内容不手工复制。
- 进行中的 Work Item、ExecPlan 和验收证据留在本工程；关闭后压缩到交付摘要。
- 长期记忆只保留当前恢复点和重复、高影响、可验证的经验。
- 文档变更执行 `pnpm docs:check`，预算或链接不通过时不得关闭工作项。
