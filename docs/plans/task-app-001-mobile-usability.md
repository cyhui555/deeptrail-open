# TASK-APP-001 真机移动端可用性修复 ExecPlan

- 状态：Ready for Review / G2
- 关联 Work Item：[`TASK-APP-001`](../issues/task-app-001-android-basic.md)
- 关联 Requirement：`REQ-APP-001`
- 基线：`main@bfc3068`
- 工作分支：`fix/task-app-001-mobile-geo`
- 最近更新：2026-07-20

## 目标

修复真机截图暴露的行程折叠态、窄屏按钮和规划概要可读性，不改变 Android 测试壳架构、现有路由或业务操作含义。

## 范围内

- 重排 `ItineraryTimeline` 折叠卡片和工具栏，缩小移动端时间线占位。
- 调整 `DayNavigator` 移动端视觉尺寸，同时保留至少 44px 触控目标和横向滚动。
- 压缩详情页主操作按钮，禁止标签换行。
- 将规划概要改为稳定的移动端定义列表，并格式化 ISO 本地日期时间。
- 补 360px 与 390px Playwright 回归。

## 范围外

- 手机 GPS、WebView Geolocation、TLS、原生定位与后台轨迹。
- iOS、原生地图、商店发布、正式签名和跨框架迁移。
- 规划任务 POI 地理编码失败由独立 [`BUG-20260720-001`](../issues/bug-20260720-001-geocoding-qps-cascade.md) 跟踪。

## 验收

- [x] 360px 与 390px 下主操作保持单行且触控高度不小于 44px。
- [x] 日期导航保持单行滚动，折叠卡片不超过 150px 且无横向溢出。
- [x] 规划概要时间可读，不在双列卡片内逐段断行。
- [x] 定向 Playwright 2/2、既有 smoke 13/13 和适用静态门禁通过。

## 回退

回退 Web 组件和对应浏览器测试即可；不涉及数据库、后端契约、Android 签名或用户数据。

## 下一项唯一动作

与 `BUG-20260720-001` 一并完成代码审查后进行新版真机复验。
