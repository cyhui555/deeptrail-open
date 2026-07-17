# M14 离线同步幂等化交付摘要

- 工作项：`TASK-M14-001`
- Requirement：`REQ-DATA-002`
- 路线图：`ROADMAP-002`
- 完成日期：2026-07-16

## 客户端与协议结果

- 打卡请求新增可选 `idempotencyKey`；现场页在首次提交前生成稳定标识，网络失败入队后继续复用同一值。
- 每个轨迹采样点在首次上传前生成 `clientPointId`；失败批次进入离线队列后，后续分批重放不重新生成标识。
- `travel-offline` IndexedDB 升级到 v2；旧 v1 待同步记录在发网前补齐并持久化标识，成功记录删除，失败批次及后续数据继续保留。
- 并发 `syncAll` 继续合并为单次同步；成功响应丢失后，客户端可以使用原标识安全重试。
- 轨迹 `recordedAt` 接受 `Z`、显式 offset 及兼容的旧无时区格式；入口统一归一为 UTC，旧无时区固定按 UTC+08:00 解释，查询 API 始终回传 `Z`。

## 服务端与数据库结果

- 打卡先校验资源所有权，再判断幂等结果；同一打卡项与同一键重试返回成功，不同键维持状态冲突，同一任务内其他打卡项复用该键明确失败。
- `PENDING → CHECKED_IN` 使用条件更新作为唯一状态闸门，只有赢得跃迁的请求可以原子递增父任务计数；撤销打卡同步清空幂等键。
- 轨迹上传按行程批量预查、批内去重，并由 `(plan_id, client_point_id)` 唯一索引和 `ON CONFLICT DO NOTHING` 覆盖并发竞争。
- Flyway V4 新增 nullable 幂等字段与任务/行程范围唯一索引；未携带新字段的旧客户端继续沿用原行为，不同任务或行程可复用相同标识。
- Flyway V5 将既有无时区 `recorded_at` 按 UTC+08:00 迁移为 UTC，并按显式时区归一修复期数据；上传批次先完成全部时间转换与校验，混合合法/非法数据失败时零新增。

## 长期证据

- Web：`apps/web/src/lib/api.ts`、`apps/web/src/lib/offlineSync.ts`、`apps/web/src/app/(protected)/trips/[planId]/checkin/page.tsx`、`apps/web/src/app/(protected)/trips/[planId]/track/page.tsx`、`tests/e2e/m14-offline-idempotency.spec.ts`
- Server：`apps/server/src/main/java/com/ai/travel/service/CheckinExecutionService.java`、`apps/server/src/main/java/com/ai/travel/service/TrackService.java` 及对应 Mapper、Controller 与 Service 测试
- Schema：`database/migrations/V4__add_offline_idempotency_keys.sql`、`database/migrations/V5__normalize_track_recorded_at_to_utc.sql`
- 贯穿回归：`apps/server/src/test/java/com/ai/travel/e2e/OfflineSyncE2ETest.java`、`apps/server/src/test/java/db/migration/TrackRecordedAtUtcMigrationTest.java`、`tests/e2e/m14-offline-idempotency.spec.ts`

## 验证

- Server：627/627 通过并满足覆盖率门槛；Server E2E：37/37 通过；Contract：1/1 通过。
- 真实 Spring → Controller → MyBatis → SQLite 链路中，同一打卡键重复提交只计数一次；轨迹批次重传新增数为 0，查询无重复点。
- 轨迹时间贯穿回归确认 API 始终返回 `Z`；混合合法/非法上传返回统一参数错误，整批零新增。
- Playwright M14 定向 3/3 通过；v1→v2 场景确认首次 POST 网络边界前幂等键已落库、失败后队列仍为一条，联网重试复用同键并清零。
- Playwright 连续两轮全量 116 条均为：115 通过、1 条件跳过、0 失败。
- 固定等待、`force` 与 `networkidle` 扫描均为 0；文档与差异检查在关闭时复验。

## 已知边界

- SQLite 仍是单写者；极端并发若出现既有 `SQLITE_BUSY`，客户端应继续使用同一标识重试，条件更新与唯一索引保证不会产生重复业务结果。
- 待同步数量、同步中状态、失败原因和用户手动恢复属于后续 `ROADMAP-006`，其实施依赖现已满足。
- 本轮不引入外部队列或缓存服务，也不改变旧客户端缺少幂等字段时的兼容语义。
