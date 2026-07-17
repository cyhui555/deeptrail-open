# TASK-RELEASE-002 目标环境发布与验收报告

- 状态：Closed
- Requirement：`REQ-DEPLOY-002`
- 完成日期：2026-07-17
- 版本：`v0.2.0`
- 发布提交：`36bdcc0fb25cb1bd0d1295743be4465b17b7483a`
- Release：`v0.2.0-20260716-165723-36bdcc0fb25c`
- 目标入口：受控目标主机的 `30301` 端口；实际地址不写入公开源码

## 交付结果

- 通过专用 ED25519 发布身份把不可变 Git bundle 上传到 Ubuntu 主机，目标机按锁定的 OCI 基础镜像构建 Server/Web，并以 release manifest 记录源码 SHA-256、revision、UTC 时间、平台、应用镜像 ID 和基础镜像 digest。
- `current` 已原子切换到本次 release；上一 healthy release `v0.2.0-20260716-164612-bc0ffe85b624` 保留为显式代码回滚目标。
- 只映射 Web `0.0.0.0:30301 -> 3000`；Server `8080` 仅在容器网络内可见，SQLite 仅位于外部持久化目录。`30301-30400` 中服务器仅监听 `30301`，外部相邻端口 `30302` 不可连接。
- Server 使用 UID/GID `10001:10001`，Web 使用 `node`，两个容器均为只读根文件系统、`unless-stopped` 和 healthy；原有 Nginx 与 DeepStudy/DeepExam 容器未改动且保持运行。
- 受控环境文件由 `root:root` 持有且权限为 `0600`；凭据、JWT、数据库和用户资料均未写入 Git、release manifest 或报告。
- 升级前 SQLite 备份 `20260716-165838` 已生成独立 SHA-256 并通过完整性校验；迁移、当前数据库检查和容器重启恢复通过。

## 自动化入口

- Windows 一键发布：`infra/deploy/publish.ps1`，负责冻结 revision、生成并校验 bundle、上传、远端发布及外部 HTTP 验收。
- 目标机发布：`infra/deploy/remote-release.sh`，负责串行锁、不可变目录、镜像构建、升级前备份、启动、验收和原子切换。
- 独立验收：`infra/deploy/verify.sh`；认证验收：`infra/deploy/verify-auth.ps1`；回滚：`infra/deploy/rollback.sh`。
- 操作步骤、Secret 边界和回滚前置条件见[单机发布手册](../operations/production-deployment.md)。

## 验收证据

- 本地 release 门禁通过：部署脚本失败用例、PowerShell/Bash 语法、Compose 解析、lint、typecheck、Server verify、Server E2E 37/37、生产构建、11/11 路由预算和 smoke 11/11。
- 外部 `/login` 与 `/api/health` 均返回 200；管理员真实认证验证覆盖登录、`ADMIN` 身份、HttpOnly Cookie、`/me`、退出清 Cookie、退出后 401 和公开注册 404。
- Chromium 真实浏览器验证覆盖登录、首页、`/admin/users`、个人资料退出与 Cookie 清理；页面异常、控制台错误和业务请求失败均为 0。
- `sw.js` 已验证为 v5；公网 IP 当前使用普通 HTTP，不是 Service Worker 安全上下文，因此本环境没有激活 Worker。这属于 HTTPS 放行前置项，不计为完整生产就绪。
- 发布脚本及独立验收均执行重启恢复；重启后再次通过外部入口、管理员认证和浏览器验收。
- 前三次目标机构建分别暴露 Node/pnpm 版本、npm 下载超时和 sqlite-jdbc `noexec` 边界；失败 release 均未切换 `current` 或接流量，修复后才完成发布。

## 放行结论与剩余边界

- 目标环境 G3：`PASS`。当前版本可在批准的 `30301` 端口提供旅迹管理与管理员分配账号能力。
- 完整生产放行：`NOT READY`。仍需受信任域名与 TLS、管理员初始凭据轮换、远程 CI/Registry 不可变制品链、异机备份 Restore、代码/数据回滚演练和云安全组留痕。
- 宿主 UFW/firewalld 未启用，发布脚本未改 raw iptables/nftables；公网连通证明当前云侧允许 `30301`，正式长期运行前仍应在云安全组中只保留必要来源与端口。

## 上线后修复

- 2026-07-17 发现目标机 `server.env` 仅含 JWT，导致 `/api/ai/status` 返回不可用；真实 LongCat 配置随后通过 SSH 加密输入原子写入 root-only 环境文件，并以强制重建而非普通 restart 让容器重新加载。
- 修复后已认证 AI 状态返回 available，生产 Server 容器到 Provider 的最小请求返回 HTTP 200 且包含 `choices`；Chromium 中不可用提示消失，页面、控制台和业务请求错误均为 0。密钥、响应正文和凭据前缀均未进入日志或报告。

## 回滚边界

- 代码回滚必须先显式确认当前 Flyway Schema 与目标 release 兼容，再运行 `rollback.sh`；脚本不会自动恢复数据。
- 数据恢复只允许先写入隔离目录并重新执行完整性与业务验收，不覆盖当前数据库。
