# 当前项目状态

- 最后核对：2026-07-17
- 当前阶段：旅迹 v0.2.0 已发布到目标环境；Loop Engineering L1 Phase 2 本地 G2 通过，GitHub Free 公开安全基线与四类最终 Profile 已完成本地验证
- 当前检查门：等待确认全新脱敏公开仓库名与独立 Reviewer；随后建立受保护主干并跑远程 CI，`BUG-20260717-001/002` 仍待不可变发布与目标环境复验
- 活动工作项：`BUG-20260717-001`、`BUG-20260717-002`、`TASK-GOV-001`
- 最近完成：`TASK-WORKSPACE-001`、`TASK-LOOP-002`、`TASK-LOOP-001`

## 当前事实

- M0–M10 产品与工程能力已交付，长期结果见 [既有交付摘要](../archive/m0-m10-delivery.md)。
- M11 已完成 PDF 与静态地图按需加载；M12 已将品牌统一为“旅迹”，首页优先继续旅行，行程工作区收敛为“行程、现场、回忆”，见 [M11](../archive/m11-delivery.md) 与 [M12](../archive/m12-delivery.md) 交付摘要。
- M13 已统一弹窗键盘交互、加固 360px 现场体验，封堵轨迹跨用户读取，并修复任务切换竞态与离线队列增长，见 [M13 交付摘要](../archive/m13-delivery.md)。
- M14 已用稳定客户端标识、IndexedDB v2、原子打卡状态与计数及 SQLite 唯一约束消除离线重放重复；浏览器回归覆盖真实 v1→v2 旧队列升级、失败保留和同键重试，见 [M14 交付摘要](../archive/m14-delivery.md)。
- 轨迹时间统一以 UTC 存储：旧无时区值固定按 UTC+08:00 解释并由 Flyway V5 迁移，API 始终回传 `Z`；混合合法/非法上传整批失败且零新增。
- M16 已清零任意固定等待、`force` 与 `networkidle`，约 93 处位置选择器仅保留 3 个业务顺序用法，见 [M16 交付摘要](../archive/m16-delivery.md)。
- 任务状态使用 SSE 优先、退避轮询回退；Web Vitals 只上报指标名、数值和受限页面分组。
- 行程列表支持增量分页；轨迹自适应采样并按 500 点批量离线同步；PWA 不缓存认证页面或 API。
- 开发环境不再注册 PWA，并会注销遗留 Worker、清理旧静态缓存后自动重载一次；生产 Worker 使用 v5 缓存并立即接管，避免开发 chunk 或旧构建长期滞留。
- LongCat 配置由本机环境变量和目标机 root-only `server.env` 提供；仓库不保存真实值。默认自动化验证使用本地 AI、地图和确定性数据替身。
- LongCat-2.0 结构化行程输出上限使用官方最大值 `131072`；测试 Profile 不再以 `4096` 覆盖，避免长 JSON 截断后产生空行程假成功。
- 完整路线默认展示计划与实际轨迹；每日现场地图始终挂载并暴露坐标补全失败恢复；PDF 必须在坐标刷新与静态地图成功后生成，详见 [地图与 PDF 执行链路恢复摘要](../archive/bug-20260716-001-map-route-recovery.md)。
- 自定义打卡点与 AI 打卡点复用同一白色卡片底和内容层级；无独立描述但有地图地址的自定义项按“内容在上、地点在下”展示，地图选中态只在外层保留一次联动描边，详见 [样式热修摘要](../archive/bug-20260716-002-custom-checkin-card-style.md)。
- 后台运营第一期已关闭默认环境公开注册，由 Flyway V6 初始化唯一 `ADMIN`；管理员可在 `/admin/users` 分页搜索、创建、启停和重置普通用户密码，被停用账号的既有 Token 会立即失效，详见 [后台用户管理交付摘要](../archive/task-ops-001-admin-user-management.md)。
- PWA Worker 已升级到 v5；预缓存与静态资源缓存失败直接回退网络；登录、退出和离线队列清理已解耦，IndexedDB 损坏或配额异常不会再把成功认证变成 `Internal error`，登录页可直接清除残留会话，详见 [PWA 配额与认证存储热修摘要](../archive/bug-20260716-003-pwa-quota-fallback.md)。
- v0.2.0 已以 release `v0.2.0-20260716-165723-36bdcc0fb25c` 发布到受控目标主机的 `30301` 端口：不可变 release、OCI 身份、非 root/只读容器、外部数据目录、发布锁、SQLite 备份校验、独立验收、单端口开放与显式回滚均已验证；实际地址不写入公开源码，详见[目标环境发布报告](../archive/task-release-002-production-deployment.md)。
- LoopAny 已以薄 Gateway 和项目外 Workspace 接入；不可变 ExecutionSpec、Task/Outcome 引用链、Transaction v2、分阶段恢复、15→17 Kind 升级与隔离 Backup/Restore 已通过本地 G0—G3 和 PR #19 远程 CI，见[交付摘要](../archive/task-loop-002-loop-contract-hardening.md)。

## 当前约束

- 工程所有者已授权：提交 GitHub Issue 或 Bug 时，同步登记本地 Work Item/看板、执行适用文档检查，并直接提交、推送与合并范围内 Git 变更，无需逐次确认；当前治理例外期 fast-forward 推送 `main`，例外失效后通过必需检查合格的 Pull Request 合并，不自动部署。产品继续保留现有路由和框架主版本，不引入多人协作、票务接入或基础设施迁移。
- 11 条关键 Web 路由均有首屏 JS gzip 预算，现场执行当前为 `128.1 / 160 kB`。
- RUM 不采集 URL、查询参数、用户标识或表单内容；指标接口失败不得阻塞交互。
- 私有媒体每次读取重新鉴权并使用 `no-store`；退出或会话失效时清理离线业务数据。
- 目标入口当前按普通 HTTP 设计，Cookie Secure 会在该环境关闭；远程 CI/Registry、TLS、凭据轮换、独立介质 Restore 和回滚演练完成前不声明完整生产放行。
- LoopAny 上游许可和 GitHub 主干保护明确前，不 vendor、分发或提升到 L3 自动 PR/Merge。

## 最后验证

- LoopAny：Gateway 12/12、真实 Runtime 集成 1/1、四阶段恢复、隔离 Backup/Restore、Doctor 与 Recovery 通过；最终 `quality-light/server/web/smoke` Run 分别为 `run-9b115da9558fcf60ad1a86d7`、`run-f36b7d343123da21a00e91b4`、`run-a99a4fbb422e41b74b57b1c3`、`run-c56fa78646fe884d24837d28`，均首次通过且重复零命令复用。
- `pnpm test:e2e` 封板全量：119 条中 118 通过、1 条件跳过、0 失败；覆盖本轮新增地图、PDF、离线与 UI 回归。
- `tests/e2e` 中 `waitForTimeout`、`force`、`networkidle` 均为 0，仅保留 3 个真实业务顺序选择器。
- `pnpm perf:check`：11/11 路由通过；首页 `113.3 / 145 kB`，现场执行 `128.5 / 160 kB`，完整路线 `111.6 / 150 kB`。
- 全套浏览器验收使用本地 AI 与地图替身，未调用真实外部服务或用户数据。
- 人工真实 Provider 探针已确认外部 AI 可连接；旧 `4096` 上限复现响应 JSON 截断与 `dayCount=0`。提升到 `131072` 后再次真实调用，返回 7525 tokens，直接解析成功且 `dayCount=1`，本地 18080 替身保持关闭。
- 地图与 PDF 定向 Playwright 14/14 通过；Web typecheck、lint、Server compile 与 Checkstyle 通过。真实高德复核当前行程坐标 13/13、静态地图 200、PDF 4,271,372 bytes，完整路线与每日地图可见且列表联动无页面错误。
- 自定义打卡点样式热修：地图路线定向 Playwright 4/4、M13 边界 4/4、Web typecheck 与 lint 通过；旧 Worker 与旧开发 chunk 场景清理后 controller、注册和旅迹缓存均归零；浏览器按截图字段复核主内容与地点顺序正确且无页面错误。
- 后台用户管理：Server `verify` 647/647、服务端 E2E 37/37、生产模式关键浏览器回归 10/10；根 lint、typecheck、生产构建和 11/11 路由体积预算通过，用户管理 gzip `98.1 / 140 kB`。
- PWA 配额热修：Web 生产构建通过；Chromium 将站点配额限制为 1 KB 后，Worker 仍受控、Next.js 静态脚本返回 200、页面标题存在且零失败请求；定向回归 1/1 通过。
- 登录跳转复验：管理员登录 POST 200、HttpOnly Cookie 写入、完整导航到首页且认证数据加载成功；登录与管理员分配 smoke 2/2 通过。
- 认证存储复验：强制 IndexedDB `open/deleteDatabase` 抛出 `Internal error.` 后，登录、个人资料退出与登录页清除状态均成功；截图账号真实链路登录 200 且最终 Cookie 已清除，完整 smoke 11/11 通过。
- v0.2.0 release 门禁：部署脚本静态失败用例、PowerShell 语法、Compose YAML、lint、typecheck、Server verify、Server E2E 37/37、生产构建、11/11 路由预算和 smoke 11/11 通过；硬导航 hydration 前输入重置竞态已由控件就绪门禁消除。
- 目标环境：外部登录/健康 200、管理员认证与注册关闭通过、Chromium 登录/后台/退出零页面错误，升级前备份校验、数据库检查、容器重启恢复和端口最小暴露通过；HTTP 下 Service Worker 不激活。
- 生产 AI 修复：目标机补齐 LongCat 配置并强制重建容器后，已认证状态 available、生产容器 Provider 探针 HTTP 200/`choices`，Chromium 不可用提示消失且零页面、控制台和业务请求错误。
- BUG-20260717-001：Server 655/655、后端 E2E 37/37、浏览器 smoke 11/11、lint/typecheck/JaCoCo 通过；已 fast-forward 合入 `main@6495d3e`，尚未部署。

## 下一项唯一动作

工程所有者确认全新脱敏公开仓库名和独立 Reviewer 后建立受保护主干并验证远程 CI，再进入两个 Bug 的不可变发布复验。
