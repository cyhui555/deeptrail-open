# 当前项目状态

- 最后核对：2026-07-19 23:59 +08:00
- 当前阶段：`TASK-APP-001` 真机反馈修复 G2 + `TASK-LOOP-008` 维护试运行
- 当前检查门：公开 `main@bfc3068` 与 `origin/main` 一致；主工作树干净
- 活动工作项：`TASK-APP-001`（唯一产品任务）、`TASK-LOOP-008`（唯一维护试运行）

## 当前事实

- 旅迹 v0.2.0 已部署并完成目标环境 G3；当前公开主干为 `main@bfc3068`。
- PR #65 已将 Android WebView debug APK 基础切片合入 `main@f9722a2`；远程构建、应用身份、调试签名与摘要验证通过，未部署。
- PR #64 已将 HTTP 方法不支持异常统一映射为 HTTP 405 / `METHOD_NOT_ALLOWED` 并合入 `main@bfc3068`；合并后主干 CI 成功。
- 真机反馈修复位于本地 `fix/task-app-001-mobile-geo@f9722a2`，包含行程折叠、窄屏按钮和 Web Geolocation 诊断；定向回归 4/4、浏览器 smoke 13/13、Android 合同测试 9/9、整库测试 677/677 及 lint、typecheck、构建、文档检查通过。
- 上述真机反馈修复尚未提交、创建 PR 或重新生成 APK，且基线落后当前主干一个提交；它不是公开交付事实。
- 当前 HTTP 测试壳仍受 Android WebView 安全来源规则阻断，代码只能提前解释限制并保留手动打卡；真正恢复 APK 内 GPS 仍需 HTTPS，或另立原生定位方案。
- `TASK-RELEASE-004` 已合入但首次真实远程制品运行仍等待两项 Web 构建配置，不部署且不占用产品 WIP。
- React Doctor Daily 保持只读失败关闭；最近基线为 `healthScore=38`，不得自动合并或部署。

## 工作区边界

- 唯一活动事实源是 `E:\deep\deeptrail\travel-open`；`E:\deep\deeptrail\travel` 仅保留旧私库与恢复证据，默认只读。
- 用户产品任务使用 `.local` 独立 worktree，定时自动化使用 `.loop-worktrees`；共享主工作树不切换任务分支。
- 未提交 worktree必须先保全再回收；squash merge 分支清理必须核对 PR Head、合并提交或 patch 等价性。

## 当前约束

- 后续产品迭代继续遵守“一轮一个最小可验证用户价值”，当前只开发 Android；iOS、推送、支付、原生地图、完整离线和商店发布均后置。
- 普通功能与治理变更仍通过受检 PR；同账号管理员人工旁路不授权 Agent、Workflow 或 Loop 自动审批、合并或部署。
- 正式 Android 仍要求受信任 HTTPS Origin、最终 application ID 与签名证书归属；不得用 HTTP、混合内容或未审计 JavaScript Bridge 作为生产方案。
- 完整生产放行仍缺 TLS、凭据轮换、独立介质 Restore 和正式回滚演练，不得把测试 APK 或目标环境通过描述为正式发布。

## 下一项唯一动作

将 `fix/task-app-001-mobile-geo` 同步到 `main@bfc3068`，解决看板与项目状态重叠并重新运行适用门禁；通过受检 PR 交付后再生成 APK 做真机复验，不自动部署。
