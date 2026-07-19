# 本地运行

推荐在仓库根目录的两个终端分别使用 `pnpm dev:server`、`pnpm dev:web` 启动；Server 启动前必须在当前环境设置至少 32 个随机字节的 `JWT_SECRET`。当前根 `pnpm dev` 经 Turborepo 启动时不会向 Server 透传该变量，不能作为联合启动入口。Windows 用户也可以先设置 `JWT_SECRET`，再运行 `scripts/start-all.ps1`，日志写入根目录 `log/`。

生产式本地容器启动：

```powershell
docker compose --env-file .env -f infra/docker/compose.yml up --build
```

Compose 强制要求安全的 `JWT_SECRET`，真实凭据只放入未跟踪的 `.env` 或部署 Secret。
