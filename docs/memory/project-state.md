# 当前项目状态

- 最后核对：2026-07-19
- 当前阶段：`TASK-APP-001` G2 Review + `TASK-LOOP-008` G2
- 当前检查门：公开 `main@88b5092`；当前短期分支 `agent/task-app-001-android-basic`
- 活动工作项：`TASK-APP-001`（唯一产品任务）、`TASK-LOOP-008`（唯一维护试运行）

## 当前事实

- PR #62 已合入并完成主干 CI；`TASK-RELEASE-004` 只等待首次真实远程制品运行，不部署且不再占用产品 WIP。
- 工程所有者要求后续产品迭代采用最小可验证切片，当前只开发 Android；iOS 因复杂度明确后置。
- Android 首期复用现有 H5/PWA、同源认证与现场执行流程，不重写业务前端。
- Android 基础切片已加入稳定 PWA 身份、浏览器条件化安装入口、失败关闭的 Digital Asset Links 与确定性就绪检查。
- PR #65 已生成仅用于当前 H5 验收的 WebView debug APK；正式 release、正式签名、商店发布与自动部署仍禁止。
- React Doctor Daily 保持 `0 6 * * *`（`Asia/Shanghai`）启用，不自动合并或部署。

## 当前约束

- 禁止直推 `main`；短期分支经 Required Checks 和作者外审批合入，不自动部署。
- 当前只补齐 PWA 身份、站点与应用关联及就绪检查；不扩展 iOS、推送、支付、原生地图、完整离线或后台能力。
- Digital Asset Links 必须失败关闭；不提交签名密钥、真实用户数据或明文生产 App 快捷配置。
- 正式 TWA 仍要求受信任 HTTPS Origin、application ID 与签名证书指纹。

## 当前验证

- Android 单测 8/8、标准关联路径运行时测试 1/1、浏览器 smoke 13/13 与安全测试 19/19 通过。
- lint、typecheck、生产构建、文档、Work Item、11 条路由体积和 diff 检查通过。
- `Android Test APK` 运行 #29685119973 在 `ac2eaa5` 成功；`apksigner`、`com.deeptrail.app.debug` 应用身份与下载后 SHA-256 均验证通过。
- 本机不具备 Android SDK、adb 或 Gradle；APK 已由远程 Runner 构建并下载，尚未执行真机安装与启动验收。

## 下一项唯一动作

在 Android 真机安装测试 APK，验收启动、登录和基础页面；不触碰 iOS、正式签名、商店发布或部署。
