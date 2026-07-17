# BUG-20260716-001 地图与 PDF 执行链路恢复摘要

- 状态：已关闭
- 日期：2026-07-16
- 范围：完整路线、PDF 地图、每日行程地图联动、现场执行地图

## 产品决策

不整包回滚 M12 UI/UE。历史差异确认“当前日无坐标时不挂载地图”和完整路线标记点击空回调在 UI/UE 调整前已经存在，直接回退会保留根因。此次恢复旧交互意图，并修复坐标就绪、消费者时序与列表联动。

## 交付结果

- “完整路线”默认展示“计划 + 实际”，地点卡片与地图标记共享选中、居中、信息窗和滚动状态；尚无 GPS 采样时先展示计划路线，实际轨迹从现场记录后叠加。
- 每日现场地图不再受“当前日必须已有坐标”的外层条件限制；无坐标、补全中和失败状态仍保留地图区域、坐标校准与显式重试入口。
- PDF 导出先触发坐标补全并重新读取任务；零有效坐标或静态地图失败时明确阻止无地图 PDF，部分坐标时保留地图和全部文字内容并提示。
- 坐标有效性由共享契约校验；“川西”等宏观区域按省级归属判断，明确属于出发地的首站允许按出发地重试，仍拒绝无关跨省结果。

## 验收

- 当前真实行程 13 个有效地点坐标全部就绪；GPS 轨迹点为 0，符合尚未现场采样的状态。
- 真实高德浏览器验收确认完整路线与每日地图可见，卡片/标记双向联动，静态地图请求为 200，导出 PDF 为 4,271,372 bytes，页面无运行时错误。
- 地图与 PDF 定向 Playwright 回归 14/14 通过；Web typecheck、lint 与 diff check 通过。
- Server 定向地理编码与坐标补全测试通过；compile 与 Checkstyle 通过。

## 证据入口

- Web：`apps/web/src/app/(protected)/trips/[planId]/overview/page.tsx`、`apps/web/src/app/(protected)/trips/[planId]/checkin/page.tsx`、`apps/web/src/components/PdfExportButton.tsx`
- Server：`apps/server/src/main/java/com/ai/travel/util/GeoUtils.java`、`apps/server/src/main/java/com/ai/travel/service/CheckinCoordinateService.java`
- 回归：`tests/e2e/map-route-regression.spec.ts`、`tests/e2e/pdf-export-layout.spec.ts`、`apps/server/src/test/java/com/ai/travel/service/CheckinCoordinateServiceTest.java`
