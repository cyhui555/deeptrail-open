# 本地运行

推荐在仓库根目录使用 `pnpm dev` 联合启动，或使用 `pnpm dev:server`、`pnpm dev:web` 分别启动。Windows 用户也可以运行 `scripts/start-all.ps1`，日志写入根目录 `log/`。

生产式本地容器启动：

```powershell
docker compose --env-file .env -f infra/docker/compose.yml up --build
```

Compose 强制要求安全的 `JWT_SECRET`，真实凭据只放入未跟踪的 `.env` 或部署 Secret。
