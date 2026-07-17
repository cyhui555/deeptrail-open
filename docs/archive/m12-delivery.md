# M12 旅迹旅行执行体验与全链路性能交付摘要

- 工作项：`TASK-M12-001`
- Requirement：`REQ-BRAND-006`、`REQ-PRODUCT-001`、`REQ-UX-003`、`REQ-PERF-002`
- 完成日期：2026-07-16

## 产品结果

- 产品名从“旅轨”统一为“旅迹”，覆盖界面、认证、元数据、PWA、PDF、OpenAPI、脚本与当前文档；历史归档保留原始事实。
- 首页首屏优先展示进行中行程，其次展示最近即将出发的计划行程，并提供“继续旅行”或“查看行程”主操作。
- AI 规划保留为创建旅行的入口，不再占据已有行程用户的最高任务优先级。

## UI / UE 结果

- 行程内五个平铺入口收敛为“行程、现场、回忆”三个阶段，原清单、概览、打卡、轨迹和评价 URL 保持兼容。
- 新增统一 Toast 与可访问确认对话框，关键流程移除浏览器原生 `alert` / `confirm`；矿物蓝、成功、警告和危险语义统一。
- AI 生成、优化和小红书导入表单支持跨刷新草稿恢复，成功、退出和会话失效时按边界清理。
- 地图标记与行程卡片共享选中状态：列表点击居中地图，标记点击切换天并滚动到卡片，支持键盘触发和高亮反馈。
- 现场执行、轨迹、旅行回忆、媒体上传和星级评分完成移动端、加载、空态、错误态与可访问语义更新。

## 性能与可靠性结果

- 首屏体积预算从单一概览页扩展为 11 条关键路由；构建后自动按 gzip 估算执行非零失败门禁。
- 新增脱敏 Web Vitals 上报与 Micrometer 直方图，只接受 CLS、FCP、INP、LCP、TTFB 和受限页面分组。
- AI 任务状态改为 SSE 优先、指数退避轮询回退；服务端校验任务归属、限制连接时长并只发送状态数据。
- 行程列表支持按状态和分页隔离缓存、增量加载与去重，服务端限制分页上限。
- 轨迹按速度、精度和最长间隔自适应采样，限制内存点数并批量写入 IndexedDB；地图绘制前下采样长轨迹。
- 媒体上传限制 50 MB、并发为 2，及时释放 Blob URL；私有媒体响应使用 `no-store` 并每次验证所有权。
- Service Worker 只缓存静态哈希资源和公共离线壳，API 与认证导航不入 Cache Storage；退出时清理离线业务数据。

## 长期证据

- 产品与界面：`apps/web/src/app/(protected)/page.tsx`、`apps/web/src/components/TripsSubNav.tsx`、`apps/web/src/components/FeedbackProvider.tsx`
- SSE 与 RUM：`apps/web/src/hooks/useTaskPoller.ts`、`apps/web/src/components/WebVitalsReporter.tsx`、`apps/server/src/main/java/com/ai/travel/service/TaskStatusStreamService.java`
- 性能与离线：`scripts/check-overview-bundle.mjs`、`apps/web/src/hooks/useTrackRecorder.ts`、`apps/web/public/sw.js`
- 回归：`tests/e2e/smoke.spec.ts`、`tests/e2e/checkin-map-marker-icons.spec.ts`、`tests/e2e/trip-plan.spec.ts`

## 验证

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm verify:server`、`pnpm test:contract`、`pnpm eval`、`pnpm build`：通过；后端 608 项测试及覆盖率通过。
- `pnpm test:e2e:server`：36/36 通过；`pnpm test:e2e`：108 通过、1 条件跳过、0 失败。
- `pnpm perf:check`：11/11 通过；首页 `113.3 / 145 kB`，现场执行 `123.8 / 160 kB`，旅行回忆 `100.0 / 140 kB`。
- Playwright 以本地 AI、地图与确定性数据替身完成桌面浏览器验收；未调用真实第三方服务或用户数据。

## 边界

本次不包含多人实时协作、票务酒店接入、公共路线市场、数据库或对象存储迁移，也不升级 Next.js、React、Spring Boot 或 Spring AI 主版本。
