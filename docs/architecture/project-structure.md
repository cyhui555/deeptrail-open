# 工程目录结构

## 目标

本工程沿用参考项目的 monorepo 职责边界，同时保留 Travel 现有 Java/Next 技术栈。

| 目录 | 职责 |
| --- | --- |
| `apps/web` | Next.js 移动 Web/PWA、页面、浏览器状态与 API 客户端 |
| `apps/server` | Spring Boot 模块化单体、HTTP API、异步任务、存储与外部服务适配 |
| `database` | SQLite schema、版本化迁移和结构说明的事实源 |
| `packages/config` | Maven Checkstyle 等无密钥的共享工程配置 |
| `tests/e2e` | Playwright 跨 Web/API 端到端测试 |
| `evals` | Prompt 资产与 AI 结果约束的确定性基线评测 |
| `infra` | Docker、本地部署和反向代理配置 |
| `docs` | 产品事实、架构、技术、Issue、计划、验收和工程记忆 |

## 依赖方向

```text
apps/web → HTTP API
apps/server/controller → service → mapper/entity
apps/server → database 打包资源
tests/e2e → Web 与 API 公共接口
evals → Prompt、Schema 和公开契约
packages/config → 不依赖 apps
```

Web 不读取数据库或 Server 内部源码；Controller 不直接实现业务规则；外部 AI、地图和网页结果必须在 Service 层校验后才能持久化。
