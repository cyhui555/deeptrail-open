# 远程不可变制品链

- Work Item：`TASK-RELEASE-004`
- Workflow：`.github/workflows/release-artifacts.yml`
- 环境：`release-artifacts`
- Registry：`ghcr.io/cyhui555/deeptrail-{server,web}`

该链路只构建、推送和封装证据，不连接目标主机，不启动 Compose，不发布 GitHub Release，也不执行数据库迁移或回滚。

## 一次性配置

在 GitHub `release-artifacts` Environment 中配置：

- `NEXT_PUBLIC_AMAP_KEY`
- `NEXT_PUBLIC_AMAP_SECURITY_CODE`

两项值会固化进浏览器产物，不是 Server Secret；仍通过 Environment Secret 注入，避免进入仓库、命令参数和日志。不要复制 `/etc/deeptrail/server.env`，也不要在该环境配置 JWT、AI Provider、数据库或 SSH 凭据。

## 手动运行

1. 等待制品 Workflow 合入受保护 `main`，并确认五项 Required Checks 全绿。
2. 读取当前 `main` 的完整 SHA，触发 `Release artifact chain`，`revision` 精确填写该 SHA。
3. Workflow 会再次比较输入与远端 `origin/main`；任何漂移、脏工作树、空构建配置或非 digest 基础镜像都会失败关闭。

CLI 示例：

```powershell
$Revision = gh api repos/cyhui555/deeptrail-open/commits/main --jq .sha
gh workflow run release-artifacts.yml --repo cyhui555/deeptrail-open --ref main -f "revision=$Revision"
```

## 产物与核验

GHCR 输出：

- `ghcr.io/cyhui555/deeptrail-server@sha256:...`
- `ghcr.io/cyhui555/deeptrail-web@sha256:...`

Actions Artifact `deeptrail-<release-id>` 包含：

- `release.json`：Release、Revision、Server/Web digest 与基础镜像 digest。
- `source.bundle` / `source.bundle.sha256`：完整源码历史与独立摘要。
- `compose.production.yml`：后续部署使用的编排模板。
- `release-package.sha256`：包内关键文件校验和。

验收时核对 Workflow Summary、`release.json.revision`、两个 GHCR digest、bundle SHA-256 与 Artifact 校验和；BuildKit 为推送镜像附加最大 provenance 与 SBOM。

## 后续边界

本链路通过不等于生产放行。目标机改用 Registry digest、TLS、凭据轮换、独立介质 Restore 与正式回滚演练仍需独立 Work Item 和授权，本任务不提前执行。
