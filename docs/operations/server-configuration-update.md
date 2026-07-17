# 旅迹服务器配置更新手册

本文用于更新受控目标服务器上的运行配置。实际地址只从发布环境的 `DEEPTRAIL_DEPLOY_HOST` 读取，不写入仓库。目标是：不泄露 Secret、不修改不可变 release、不影响 SQLite 数据，并且能够复验和回退。

## 1. 先判断配置类型

| 配置位置 | 典型内容 | 生效方式 |
| --- | --- | --- |
| `/etc/deeptrail/server.env` | `JWT_SECRET`、LongCat、`GAODE_API_KEY`、Token 有效期 | 强制重建 Server；建议同时重建 Web 完成整链复验 |
| `/etc/deeptrail/web.env` | `AMAP_REST_KEY` 等仅供 Next Server 使用的 Secret | 只强制重建 Web |
| `/etc/deeptrail/web-build.env` | `NEXT_PUBLIC_AMAP_KEY`、`NEXT_PUBLIC_AMAP_SECURITY_CODE` | 必须重新构建并发布新 release；重启无效 |
| `/srv/deeptrail/current/production.env` | 端口、Origin、镜像 ID、持久化目录、Cookie Secure | 禁止原地修改；通过新 release 或正式部署参数变更 |
| release 中的 Compose、`release.json`、应用镜像 | 容器结构、镜像和版本身份 | 必须发布新的不可变 release |

`env_file` 只在创建容器时读取。`docker compose restart` 不会重新加载配置，必须使用 `up -d --force-recreate`。

## 2. 安全边界

- 不在 Git、Markdown、聊天、日志、截图、命令参数或 `production.env` 中填写真实密码、Token、API Key。
- 不执行 `cat /etc/deeptrail/*.env`，只允许检查变量名、是否为空、文件权限和长度。
- `/etc/deeptrail` 保持 `root:root 0700`；三个环境文件保持 `root:root 0600` 或更严格。
- 不删除或覆盖现有 `JWT_SECRET`。轮换 JWT 会使全部用户会话失效，必须单独安排维护窗口。
- 不修改 `/srv/deeptrail/current` 指向的 release 内容；配置变更与代码发布分开记录。
- 更新前确认没有其他发布或配置操作正在执行。

## 3. 标准更新流程

### 3.1 登录并确定 current

从受控发布机登录，使用专用 SSH 私钥，不在命令行传密码：

```powershell
$DeployHost = $env:DEEPTRAIL_DEPLOY_HOST
if (-not $DeployHost) { throw '请先设置 DEEPTRAIL_DEPLOY_HOST' }
ssh -i "$env:USERPROFILE/.ssh/deeptrail_release_ed25519" "ubuntu@$DeployHost"
```

在服务器执行：

```bash
set -euo pipefail
current="$(readlink -f /srv/deeptrail/current)"
test -n "$current"
printf 'current=%s\n' "$current"
sudo docker ps --filter name=deeptrail --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

两个容器必须处于 healthy，且 current 必须指向 `/srv/deeptrail/releases/<release-id>`。

### 3.2 创建临时受控备份

以下以 Server 配置为例：

```bash
stamp="$(date -u +%Y%m%d-%H%M%S)"
backup="/etc/deeptrail/server.env.before-${stamp}"
sudo install -o root -g root -m 0600 /etc/deeptrail/server.env "$backup"
printf 'backup=%s\n' "$backup"
```

备份同样包含 Secret，只能短期保留在 `/etc/deeptrail`，验收完成后删除。不要复制到用户目录或下载到发布机。

### 3.3 使用 `sudoedit` 修改

```bash
sudoedit /etc/deeptrail/server.env
```

每行使用 `KEY=value`，不要增加 `export`。更新 LongCat 时保留现有 `JWT_SECRET`，并确认以下四项非空：

```text
SPRING_AI_OPENAI_API_KEY=<受控值>
SPRING_AI_OPENAI_BASE_URL=<OpenAI-compatible base URL>
SPRING_AI_OPENAI_MODEL=<模型名>
SPRING_AI_OPENAI_CHAT_OPTIONS_MAX_TOKENS=131072
```

重新收紧权限，并只输出脱敏键名：

```bash
sudo chown root:root /etc/deeptrail/server.env
sudo chmod 0600 /etc/deeptrail/server.env
sudo stat -c 'owner=%U:%G mode=%a size=%s' /etc/deeptrail/server.env
sudo awk -F= '/^[A-Z][A-Z0-9_]*=/{print $1 "=<redacted>"}' /etc/deeptrail/server.env
```

不得把最后一条命令改成输出 `$2` 或完整文件。

### 3.4 校验 Compose，不回显配置

```bash
sudo docker compose \
  --env-file "$current/production.env" \
  -f "$current/compose.production.yml" \
  config --quiet
```

如果该命令失败，不要重建容器；立即修复文件或按第 5 节恢复备份。

### 3.5 强制重建加载配置

更新 `server.env`：

```bash
sudo docker compose \
  --env-file "$current/production.env" \
  -f "$current/compose.production.yml" \
  up -d --force-recreate server web
```

只更新 `web.env`：

```bash
sudo docker compose \
  --env-file "$current/production.env" \
  -f "$current/compose.production.yml" \
  up -d --no-deps --force-recreate web
```

不要使用 `restart` 代替上述命令。

### 3.6 执行独立验收

```bash
release_id="$(basename "$current")"
sudo bash "/srv/deeptrail/builds/${release_id}/infra/deploy/verify.sh" \
  --current --public-url 'http://127.0.0.1:30301'

sudo docker ps --filter name=deeptrail \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

从发布机复验公网入口和认证边界：

```powershell
Invoke-WebRequest "http://${DeployHost}:30301/api/health" -UseBasicParsing

& .\infra\deploy\verify-auth.ps1 `
  -BaseUrl "http://${DeployHost}:30301" `
  -Username admin
```

AI 配置变更还必须完成：

1. 登录首页，确认“AI 规划暂不可用”提示消失。
2. 已认证 `/api/ai/status` 返回 `available=true`。
3. 从生产 Server 容器执行一次受控最小 Provider 探针，只记录 HTTP 状态和响应结构，不记录密钥、提示词结果或完整响应。
4. 检查页面错误、控制台错误和业务请求失败均为 0。

## 4. 验收完成后的收尾

确认观察窗口内服务稳定后，删除本次临时 Secret 备份：

```bash
sudo rm -f -- "$backup"
```

记录更新时间、操作者、变量名、原因、current release 和验收结果；只记录变量名，不记录值、前缀或摘要。配置更新不改变 release revision，报告中应明确这是运行环境变更。

## 5. 失败回退

如果新容器不健康、AI 状态异常或核心路径失败，立即恢复本次备份：

```bash
sudo install -o root -g root -m 0600 "$backup" /etc/deeptrail/server.env

sudo docker compose \
  --env-file "$current/production.env" \
  -f "$current/compose.production.yml" \
  up -d --force-recreate server web
```

恢复后重新运行第 3.6 节验收。若旧配置也无法恢复健康，停止继续修改，保留现场并检查：

```bash
sudo docker logs --since 10m deeptrail-server-1 2>&1 | tail -n 200
sudo docker inspect deeptrail-server-1 \
  --format 'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restart={{.RestartCount}}'
```

日志不得复制到公共渠道；先检查是否包含请求正文、用户数据或凭据。

## 6. 常见错误

- 修改环境文件后只执行 `docker compose restart`：容器继续使用旧配置。
- 把 `NEXT_PUBLIC_*` 写入 `web.env`：浏览器构建不会更新，必须重新发布 Web 镜像。
- 原地编辑 `current/production.env` 或 Compose：破坏不可变 release 和回滚证据。
- 用 `echo KEY=value`、Shell history 或命令参数传 Secret：可能进入历史记录和进程列表。
- 为排障输出完整 `docker inspect` 环境或完整 `.env`：会直接泄露凭据。
- 忘记保留 `JWT_SECRET`：会导致全部现有 Token 失效，严重时 Server 无法启动。
- 配置变更后只检查 `/api/health`：健康接口通过不代表 AI、地图或认证 Provider 已可用。

## 7. 何时必须重新发版

出现以下任一情况，不使用本手册原地更新，改走[单机发布手册](production-deployment.md)：

- 修改代码、数据库迁移、Compose、Dockerfile 或依赖。
- 修改 `NEXT_PUBLIC_*` 构建变量。
- 修改公网端口、Origin、Cookie Secure、镜像 ID 或持久化目录。
- 需要让变更具备新的 Git revision、release manifest 和回滚目标。
