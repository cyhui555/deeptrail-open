# 旅迹 v0.2.0 单机发布手册

- Work Item：`TASK-RELEASE-002`
- 共享基线：`RULE-001`、Linux 单机容器部署手册、Docker 镜像规范、部署脚本契约
- 目标主机：由受控发布环境的 `DEEPTRAIL_DEPLOY_HOST` 或 `-HostName` 参数提供，仓库不保存实际地址
- 批准端口：从 `30301-30400` 选择一个实际使用端口，不开放整个区间

脚本的参数、失败行为和最小调用见 [发布脚本说明](../../infra/deploy/README.md)。本手册只记录运行边界和发版顺序，不复制脚本实现；已部署环境只更新 Secret 或运行变量时见[服务器配置更新手册](server-configuration-update.md)。

## 拓扑与目录

```text
公网 http://<public-host>:<approved-port>
  → deeptrail-web:3000
  → Docker 私网 server:8080
  → /srv/deeptrail/data/travel.db 与 storage/

/srv/deeptrail/releases/<release-id>  不可变编排与 manifest
/srv/deeptrail/current                原子指向已验收 release
/srv/deeptrail/builds/<release-id>    干净目标机构建 checkout
/srv/deeptrail/{data,log,backups}     release 外持久目录
/etc/deeptrail/*.env                  root:root，0600/0400
```

Server、SQLite 和 Actuator 不映射宿主公网端口。Web 是唯一映射；现有 DeepStudy、Nginx、80/443 和其他端口不改动。

## 首次准备

1. 核对 SSH ED25519 指纹和登录账户，使用私钥或受控 `ssh-agent`，不把密码放进命令行或脚本。
2. 核对目标机 OS、CPU、内存、磁盘、Docker/Compose、监听、防火墙和现有容器。
3. 执行 `prepare-host.sh --initialize-server-secret`；它只在空文件中生成强随机 JWT，不输出值。
4. 按需要由管理员填写 `/etc/deeptrail/server.env`、`web.env` 和 `web-build.env`，并复核权限。
5. 选择空闲端口；后续 release 默认复用 current 端口。

AI 规划需要在 `server.env` 中配置 `SPRING_AI_OPENAI_API_KEY`、`SPRING_AI_OPENAI_BASE_URL`、`SPRING_AI_OPENAI_MODEL` 和输出上限。修改 `env_file` 后必须用当前 release 的 Compose 执行 `up -d --force-recreate server web`，仅执行 `restart` 不会重新加载环境变量；随后验证已认证的 `/api/ai/status`，并用不记录响应正文的最小真实 Provider 探针确认目标机网络与凭据有效。

当前入口是普通 HTTP，因此 `AUTH_COOKIE_SECURE=false`。在独立域名/TLS 与固定 Origin 建立前，本部署只能作为目标环境发布；弱初始管理员凭据、HTTP、远程 CI、独立备份 Restore 等门禁会阻断完整生产放行。

## 发版顺序

Windows 发布机执行：

```powershell
$DeployHost = $env:DEEPTRAIL_DEPLOY_HOST
if (-not $DeployHost) { throw '请先设置 DEEPTRAIL_DEPLOY_HOST' }
& .\infra\deploy\publish.ps1 -HostName $DeployHost -SshUser root -AppPort 0
```

该入口按顺序执行：

1. 拒绝未提交 tracked 变更，从 HEAD 生成 Git bundle 和 SHA-256。
2. 上传后由目标机重新校验制品，建立不可覆盖的干净 checkout。
3. 拉取并解析基础镜像 digest，构建带 OCI revision/version/created 的 Server/Web 镜像。
4. 校验 `release.json`、非 root 运行用户、受控环境文件与 Compose。
5. 若存在 current，先创建 SQLite 在线备份并校验摘要、完整性与外键。
6. 启动 Server；Flyway 在 Web 接流量前完成迁移，随后等待 Server/Web healthy。
7. 验证 DB、登录页、同源 `/api/health`，通过后原子切换 current。
8. 只开放批准端口，重启容器并再次验收；最后从发布机执行外部 HTTP 检查。

目标机现场构建不等于远程 CI。正式流水线应改用 `build-images.sh --push`，生产 Compose 只引用 Registry digest。

## 升级、备份与回滚

升级使用新的 release ID，任何已存在的 build/release 都不覆盖。默认备份位于 `/srv/deeptrail/backups/<utc-id>/`，包含 SQLite snapshot 和 SHA-256；它与数据同机，不能覆盖整盘/整机故障。

代码回滚前先审查新增迁移是否向后兼容：

```bash
sudo bash infra/deploy/rollback.sh \
  --release-id <previous-release-id> \
  --confirm-schema-compatible \
  --public-url 'http://<public-host>:<port>'
```

脚本不恢复数据。数据恢复必须停止写入，把备份放入全新隔离目录，执行摘要、SQLite integrity/foreign-key、应用健康和核心路径验收后再显式切换。

## 放行口径

- `目标环境 G3 通过`：镜像/manifest、迁移、DB、健康、外网、重启和同机备份验证通过。
- `完整生产放行`：还必须补齐干净远程 CI/Registry、TLS、凭据轮换、独立介质复制与 Restore、上一 release 回滚和最终审计。
- `BLOCKED`：SSH、主机身份、端口/数据归属或关键凭据边界无法确认。
