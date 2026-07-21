# TASK-APP-001 Android 基础切片验收摘要

- 状态：G3 / Closed
- Requirement：`REQ-APP-001`；关联 `REQ-AI-001`、`REQ-UX-001`、`REQ-UX-003`
- 关闭范围：`TASK-APP-001`、`BUG-20260720-001`（POI 坐标 5 QPS 限流级联）与 `BUG-20260720-002`（按天地图视口）；`BUG-20260720-003` 已在此前独立关闭。
- 交付：稳定 PWA 身份与安装入口、失败关闭的 Digital Asset Links、`com.deeptrail.app.debug` 测试 APK、360px/390px 窄屏布局、地理编码限流恢复、按天地图视口及脱敏视觉证据链。
- 自动化证据：PR #65/#67/#74/#75 已合入并通过适用 Required Checks；Server `verify` 684/684、Server E2E 39/39、前端 smoke 16/16 与移动端/地图定向回归通过。
- 最新 APK：主干 Workflow run `29809421959` 成功；应用身份 `com.deeptrail.app.debug`、debug 签名与 Artifact 校验通过，APK SHA-256 为 `ba9751a99dfbe212ce19c695bcde456cc9e6ee8b707c9371a48141a992e3bc2a`。
- 人工验收：目标环境 release `v0.2.0-20260720-120655-cd180c35b2ed` 与当前产品代码一致；工程所有者于 2026-07-21 确认 Android 功能验收通过，并明确要求对应 Bug 全部关闭、准备下一轮开发。
- 边界：本切片不包含正式 TWA/AAB、受信任 HTTPS Origin、最终 application ID、正式签名、商店发布、iOS、推送、支付、原生地图或完整离线；这些能力必须重新准入。
- 数据与安全：未把真实凭据、用户数据、APK、截图或测试报告写入 Git；历史错误任务不自动重算。
- 回滚：分别回退 PR #65/#67/#74/#75 的对应范围；不改写共享历史，不移动正式 Tag，不把代码回退替代数据库恢复。
