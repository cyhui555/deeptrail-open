# TASK-APP-001：Android 基础安装与启动

- 状态：In Progress / G2（PR #67 已合入，等待目标环境与真机复验）
- 优先级：P0
- 关联 Requirement：`REQ-APP-001`

## 目标

不重写现有 React/Next.js 业务，以最低复杂度补齐 Android 安装入口所需的 PWA 身份、站点与应用关联配置及可重复就绪检查，保持登录和现场执行流程同源。

## 范围内

- 为 PWA 固定应用 `id`、启动范围和独立显示模式。
- 仅当浏览器报告满足安装条件时显示“安装 App”入口，并由用户动作触发系统安装提示。
- 仅在 Android package ID 与证书 SHA-256 指纹均合法时公开 Digital Asset Links；未配置或非法时失败关闭。
- 提供根目录 Android 就绪命令，验证 HTTPS Origin、应用标识、证书指纹、PWA Manifest 与 Service Worker 基础条件。
- 生成仅供当前 H5 验收的 WebView debug APK；测试 URL 由构建环境注入，包名固定为 `com.deeptrail.app.debug`。
- 保持现有登录、行程和现场执行业务不变。
- 修复真机 360px 至 390px 视口下每日行程折叠态、日期导航和主操作区的拥挤、换行与层级问题。
- 将用户反馈的“地理位置失败”按真实语义记录为规划转行程时的 POI 地理编码失败，并由 `BUG-20260720-001` 修复 5 QPS 限流级联。

## 范围外

- iOS、推送、支付、原生地图、完整离线、商店发布与正式签名。
- TLS 部署、域名购买、目标机变更、正式 release APK/AAB 与本机 Android SDK 安装。
- React Native、Flutter、Capacitor 本地业务重写或新的后台能力。
- 手机 GPS、WebView Geolocation、JavaScript Bridge、原生定位通道或降低 Android target SDK。

## 验收标准

- [x] `/manifest.json` 具有稳定 `id`、`start_url`、`scope`、`standalone` 显示和现有图标。
- [x] 不满足安装条件时不显示虚假入口；收到 `beforeinstallprompt` 后可由用户触发且同一提示只消费一次。
- [x] `/.well-known/assetlinks.json` 无有效配置时返回 404，有效配置时只返回当前 Android 应用的 `handle_all_urls` 关联。
- [x] `pnpm android:check` 对合法配置通过，并拒绝 HTTP Origin、非法 package ID、非法证书指纹或不合格 PWA Manifest。
- [x] Web lint、typecheck、生产构建与既有基础流程验证通过；不引入明文生产 URL、签名文件或用户数据。
- [x] 远程干净环境构建 `com.deeptrail.app.debug`，产出可下载 APK 与 SHA-256；release 变体保持禁用。
- [x] APK 不包含正式签名，HTTP 只在 debug 变体开放；外部导航、文件访问、混合内容和 JavaScript Bridge 均失败关闭。

### 真机反馈修复

- [x] 360px 与 390px 下“加入行程清单”和“优化”保持同一行，标签不换行，触控目标不小于 44px。
- [x] 日期导航保持单行横向滚动；每日行程折叠后以紧凑摘要呈现，标题、日期、主题和活动数不互相挤压。
- [x] 规划概要中的 ISO 出发时间按可读格式展示，不再在双列卡片内逐段断行。
- [x] `BUG-20260720-001` 验证每次高德请求都受 5 QPS 限流，单次限流不再导致同批大量 POI 坐标缺失。

## 验证

- PR #67 精确 Head `107c3a4` 的五项 Required Checks 全部成功，并 squash 合入 `main@714a633`；未自动部署。
- `pnpm test:e2e app-mobile-regression.spec.ts`：2/2 通过，覆盖 360px 与 390px 布局。
- `pnpm android:test`：9/9 通过；`pnpm android:test:runtime`：1/1 通过。
- `pnpm lint`、`pnpm typecheck`、`pnpm build`：通过。
- `pnpm test`：681/681 通过；`pnpm test:e2e:smoke`：13/13 通过。
- 地理编码定向测试 62/62 通过，覆盖重试重新限流、QPS 恢复、限流不熔断与批量 POI 不中断。
- `pnpm docs:check`、`pnpm work-items:check` 与 `git diff --check`：通过。
- `pnpm security:test`：19/19 通过；文档、Work Item、11 条路由体积与 `git diff --check` 通过。
- PR #65 的 `Android Test APK` 运行 #29685119973 在提交 `ac2eaa5` 上成功；远程 `apksigner` 验证通过，应用身份为 `com.deeptrail.app.debug`。
- 下载制品大小为 12,599 字节，SHA-256 为 `135081474025e5867851d9b7ea3656b3e51586d7d7407c0e694b5642bbeec13f`；本地摘要与远程摘要一致。

## 实现后分析

- 代码侧基础能力与测试 APK 已闭环；无需为 iOS、商店能力或更多原生能力预建框架。
- 正式 Android 安装物仍需受信任 HTTPS Origin、最终 application ID 与签名证书指纹。
- 当前 Windows 开发机没有 Android SDK、adb 或 Gradle；已由 GitHub Runner 构建并验证 APK，但尚未执行真机安装与启动验收。
- 真机反馈截图确认 H5 业务可运行，但暴露了窄屏折叠态和主操作拥挤；修复已合入，目标环境与新版真机复验仍未执行，计划见 [`ExecPlan`](../plans/task-app-001-mobile-usability.md)。
- 用户已澄清第 3 项与手机 GPS 无关；真实问题由 [`BUG-20260720-001`](bug-20260720-001-geocoding-qps-cascade.md) 跟踪。

## 回滚

回退 Manifest 增量、公开关联路由、Android 校验脚本与对应配置说明即可；不涉及数据库、后端契约、目标环境或签名材料。
