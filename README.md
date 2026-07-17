# 旅迹

旅迹是一款基于 Spring AI 与 Next.js 的移动优先旅行执行应用，覆盖 AI 行程生成与优化、行程清单、地图打卡、轨迹、媒体、旅程评价和 PDF 旅行手册。

本仓库按 monorepo 组织，保留 Spring Boot + Next.js 技术栈和既有产品行为。

## 工程结构

```text
apps/web        Next.js Web/PWA
apps/server     Spring Boot API 与异步任务
database        SQLite schema 与迁移
tests/e2e       Playwright 跨应用测试
evals           确定性 AI/Prompt 基线评测
packages/config Checkstyle 等静态配置
infra           容器与本地部署
docs            产品、架构、Issue、计划和工程记忆
```

## 环境要求

- JDK 17+
- Maven 3.9+
- Node.js 24+
- pnpm 11+

安装依赖：

```powershell
pnpm install --frozen-lockfile
```

首次生成锁文件时使用 `pnpm install`。

## 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `SPRING_AI_OPENAI_API_KEY` | AI 功能必需 | OpenAI-compatible 模型服务凭据 |
| `SPRING_AI_OPENAI_CHAT_OPTIONS_MAX_TOKENS` | 否 | AI 最大输出；LongCat-2.0 默认固定为官方上限 131072，禁止回退到 4096 |
| `JWT_SECRET` | 生产必需 | JWT 签名密钥，至少 32 个随机字节 |
| `JWT_EXPIRATION_DAYS` | 否 | Token 有效天数，默认 7 |
| `GAODE_API_KEY` | 否 | 高德 Web Service Key；为空时走降级策略 |
| `APP_CORS_ALLOWED_ORIGINS` | 否 | 精确 Origin，默认 `http://localhost:3000` |
| `APP_DATA_DIR` | 否 | Server 数据目录；workspace 默认 `../../data` |
| `APP_LOG_DIR` | 否 | Server 日志目录；workspace 默认 `../../log` |
| `NEXT_PUBLIC_API_URL` | 否 | Web 访问的 API，默认 `http://localhost:8080` |

复制 `.env.example` 的变量名到操作系统或本地未跟踪配置。不要把真实值写入仓库。

## 启动

分别启动：

```powershell
pnpm dev:server
pnpm dev:web
```

或联合启动：

```powershell
pnpm dev
```

Windows 也可以运行 `scripts\start-all.ps1`。默认地址：

- Web：`http://localhost:3000`
- API Health：`http://localhost:8080/api/health`
- Swagger UI：`http://localhost:8080/swagger-ui.html`
- OpenAPI：`http://localhost:8080/v3/api-docs`

生产配置需要有效 `JWT_SECRET`；无外部 AI Key 时核心页面、账户、清单和确定性测试仍可运行，但 AI 生成请求不会成功。

## 质量门禁

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:server
pnpm test:e2e:server
pnpm build
pnpm eval
pnpm test:e2e:smoke
```

`pnpm test:e2e` 会执行全部 Playwright 用例，其中部分历史场景可能要求真实 AI/地图数据；默认交付门禁使用不访问真实外部服务的 `test:e2e:smoke`。真实网络测试必须在获得隔离凭据、联网授权并接受调用成本后显式运行。

## 文档入口

- [文档导航](docs/README.md)
- [工程目录](docs/architecture/project-structure.md)
- [需求注册表](docs/requirements/registry.md)
- [接口说明书](docs/api/接口说明书.md)
- [当前项目状态](docs/memory/project-state.md)
- [历史交付摘要](docs/archive/m0-m10-delivery.md)

## 本地数据

- SQLite 与上传文件：`data/`
- 日志：`log/`
- Maven 输出：`apps/server/target/`
- Next.js 输出：`apps/web/.next/`
- Playwright 输出：`test-results/`、`playwright-report/`

以上目录均不进入 Git。
