# TASK-DOCS-001：修复首次文档诚实性基线漂移

- 状态：In Progress
- Owner：工程所有者
- 关联 Requirement：`REQ-DOCS-001`

## 目标

修复本轮首次基线覆盖至 `origin/main@88b5092` 后，经实际命令、源码和脚本验证确认的当前文档漂移，使本地启动、Web 代理、Checkstyle、发布示例、配置验收和项目恢复状态与交付行为一致。

## 范围外

- 不修改产品代码、依赖、Schema、部署脚本或 CI。
- 不执行生产发布、服务器配置写入、真实 Provider 调用、合并或部署。

## 验收标准

1. 所有当前 Server 启动文档明确要求有效 `JWT_SECRET`，不再推荐已确认失败的根 `pnpm dev` 联合入口。
2. Web 文档只描述实际存在的同源 `/api` 与 `BACKEND_INTERNAL_URL` 转发行为。
3. Checkstyle、PowerShell 发布示例和配置验收端口与当前配置、脚本及允许范围一致。
4. `pnpm docs:check`、直接受影响的启动/脚本示例、适用质量门禁和 `git diff --check` 通过。

## 回滚

仅回退本任务关联的文档、Work Item 与看板变更；不触碰产品代码、部署状态或用户数据。
