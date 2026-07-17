# 后端运行规范

## 位置与边界

- Spring Boot 工程：`apps/server/`
- Java：17；构建：Maven Wrapper/根 pnpm 脚本
- 业务依赖方向：Controller → Service → Mapper/Entity
- 数据库事实源：`database/schema/` 与 `database/migrations/`
- 运行数据：根 `data/`；日志：根 `log/`；两者均不进入 Git

## 配置

| 变量 | 用途 |
| --- | --- |
| `SPRING_AI_OPENAI_API_KEY` | OpenAI-compatible Provider 凭据 |
| `SPRING_AI_OPENAI_BASE_URL` | Provider 基地址 |
| `SPRING_AI_OPENAI_MODEL` | 模型名 |
| `JWT_SECRET` | 生产 JWT 签名密钥，至少 32 个随机字节 |
| `GAODE_API_KEY` | 高德 Web Service Key；未配置时走受控降级 |
| `APP_DATA_DIR` / `APP_LOG_DIR` | 可选数据与日志目录 |

真实值只写入操作系统环境变量或未跟踪本机配置。源码、测试、Markdown、日志和中央记忆只允许出现变量名或占位值。

## 启动与验证

在仓库根目录执行：

```powershell
pnpm dev:server
pnpm --filter @deeptrail/server test
pnpm test:contract
pnpm test:e2e:server
pnpm verify:server
```

默认 API 为 `http://localhost:8080`，健康检查为 `/api/health`，Swagger UI 为 `/swagger-ui.html`。

## 运行规则

- Controller 参数使用 Bean Validation，异常统一转换为稳定 4xx/5xx 契约。
- 用户数据查询和媒体访问必须校验当前用户归属。
- AI、地图和网页输出先校验结构、范围与归属，再进入持久化或响应。
- 创建和状态迁移接口必须幂等，父子计数与终态路径同步维护。
- 外部 HTTP 调用设置连接/读取超时、受控重试和可诊断失败，不占用公共线程池执行长阻塞。
- 数据结构只通过版本化 Flyway migration 演进，失败时停止启动。
- 修改 Controller、配置或资源后重启 Server，再以 Health 和定向测试验收；不能仅以编译通过代替运行验证。

历史根因与通用防线见 [工程经验](../memory/lessons.md)，不在运行文档重复维护 Bug 时间线。
