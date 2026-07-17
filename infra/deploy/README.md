# 旅迹服务器发布脚本

本目录实现 `TASK-RELEASE-002` 的单机容器发布契约，适用于 Ubuntu、Docker Compose、SQLite 和单一公网 Web 端口。Server 和数据库不直接映射公网。

## 入口

| 脚本 | 职责 |
| --- | --- |
| `publish.ps1` | Windows 一键冻结 Git bundle、校验、上传、远程构建/发布并执行外部健康检查 |
| `remote-release.sh` | 目标机 bootstrap：干净 checkout、固定基础镜像、构建、发布、开端口、重启复验 |
| `build-images.sh` | CI/构建机生成唯一 Server/Web 镜像及严格 `release.json` |
| `prepare-host.sh` | 初始化 release、build、数据、日志、备份和 root `0600` 环境文件 |
| `deploy.sh` | 发布锁、manifest/镜像/Secret 校验、备份、启动、验收和原子切换 |
| `verify.sh` | 独立检查镜像身份、容器健康、DB、内部/外部入口和重启恢复 |
| `open-port.sh` | 只为 current release 开放一个 `30301-30400` 端口 |
| `rollback.sh` | 显式确认 Schema 兼容后回滚代码/配置，不覆盖数据 |

脚本使用 `/run/lock/deeptrail-deploy.lock` 拒绝并发发布；已有 release/build 不覆盖。目标目录：

```text
/srv/deeptrail/{releases,builds,data,log,backups,current}
/etc/deeptrail/{server.env,web.env,web-build.env}
```

## 一键发布

先把当前版本提交为稳定 revision，并配置 SSH 私钥或 `ssh-agent`；脚本不接受命令行密码：

```powershell
$DeployHost = $env:DEEPTRAIL_DEPLOY_HOST
if (-not $DeployHost) { throw '请先设置 DEEPTRAIL_DEPLOY_HOST' }
& .\infra\deploy\publish.ps1 \
  -HostName $DeployHost \
  -SshUser root \
  -IdentityFile "$env:USERPROFILE/.ssh/deeptrail_release_ed25519" \
  -AppPort 0
```

`AppPort=0`：首发从 `30301` 起选择空闲端口，后续发布复用 current 端口。制品保存到未跟踪的 `artifacts/releases/<release-id>/`。目标机构建只计入目标环境验收；正式流水线应使用干净远程 CI、Registry digest 和 `build-images.sh --push`。

只冻结制品、不连接服务器：

```powershell
& .\infra\deploy\publish.ps1 -HostName deeptrail.example.invalid -DryRun
```

## Secret 与地图配置

已部署服务器更新环境文件时，按[服务器配置更新手册](../../docs/operations/server-configuration-update.md)执行备份、`sudoedit`、强制重建、验收和失败回退；仅执行 `restart` 不会重新加载 `env_file`。

首次发布由 `prepare-host.sh --initialize-server-secret` 生成强随机 `JWT_SECRET`，值不输出。可由管理员在目标机补充：

- `/etc/deeptrail/server.env`：`SPRING_AI_OPENAI_API_KEY`、Provider URL/模型、`GAODE_API_KEY` 等 Server Secret。
- `/etc/deeptrail/web.env`：`AMAP_REST_KEY` 等仅供 Next Server 使用的 Secret。
- `/etc/deeptrail/web-build.env`：只允许 `NEXT_PUBLIC_AMAP_KEY`、`NEXT_PUBLIC_AMAP_SECURITY_CODE`；二者会进入浏览器产物，因此不能视为服务端 Secret，BuildKit 仅避免其出现在构建参数和历史中。

三个文件必须是 `root:root`、`0600/0400`。任何 Secret 都不得写入 `production.env`、release、命令行、Git 或报告。

目标机现场构建默认通过 `https://registry.npmmirror.com` 获取 pnpm 依赖，避免国内主机访问 npm 官方源长时间超时；干净 CI 可用 `build-images.sh --pnpm-registry <HTTPS_URL>` 显式覆盖。Registry 地址不得包含凭据或查询参数。

Server 继续使用只读根文件系统；仅为 SQLite JDBC 原生库保留一个 `exec`、64 MB、UID/GID 受限的 `/tmp` tmpfs。移除 `exec` 会使启动期原生库加载以 `failed to map segment` 失败。

## 独立验收与回滚

```bash
sudo bash infra/deploy/verify.sh --current \
  --public-url 'http://<public-host>:<port>' --restart
```

发布机再执行真实浏览器认证边界验收；密码使用 `SecureString` 交互读取，不进入命令行、脚本或报告：

```powershell
& .\infra\deploy\verify-auth.ps1 `
  -BaseUrl "http://${DeployHost}:<port>" -Username admin
```

该探针依次验证管理员登录、HttpOnly Cookie、`/me`、退出清 Cookie、退出后 401 与公开注册 404。

```bash
sudo bash infra/deploy/rollback.sh \
  --release-id <previous-release-id> \
  --confirm-schema-compatible \
  --public-url 'http://<public-host>:<port>'
```

`rollback.sh` 默认先创建 SQLite 在线备份并执行 integrity/foreign-key 校验。数据恢复不自动执行：必须停止写入，恢复到全新隔离目录并验收后再显式切换。

## 静态验证

```bash
bash infra/deploy/tests/static-tests.sh
```

覆盖 Bash 语法、帮助入口、release ID/端口边界、漂移镜像拒绝、manifest 身份和非 root 运行用户。真实 Docker 构建、失败健康、备份、重启、外部入口和回滚必须在目标机单独记录。
