# BUG-20260717-001 行程优化超时竞态与迟到结果丢弃

- 状态：Verification / G3（已发布并完成目标机 117 项固定样例复验）
- 优先级：P1
- GitHub Issue：[cyhui555/deeptrail#21](https://github.com/cyhui555/deeptrail/issues/21)
- ExecPlan：[行程优化超时修复计划](../plans/bug-20260717-001-optimize-timeout-fix.md)
- 分析报告：[服务器与本地任务耗时差异分析](../verification/bug-20260717-001-server-local-duration-analysis.md)
- 关联需求：`REQ-AI-001`、`REQ-UX-002`
- 发现环境：目标环境 `v0.2.0`
- 最近更新：2026-07-17

## 目标

修复行程优化在外部地理编码持续超时时被 watchdog 提前判定失败、后台线程仍继续执行并最终丢弃有效结果的问题，使任务状态、外部调用和用户结果保持一致。

## 范围

### 范围内

- 优化任务的统一 deadline、取消传播和终态提交规则。
- AI 结构化结果与可降级坐标补全的成功边界。
- 坐标补全的任务级时间预算、失败短路和累计延迟控制。
- watchdog 与工作线程竞争终态的自动化回归。
- 任务状态与 AI 调用日志的一致性。

### 范围外

- 不通过简单调大 watchdog 阈值掩盖累计超时。
- 不修改真实 Provider 密钥或目标机 Secret。
- 不以真实用户数据、完整线上任务标识或原始日志作为测试夹具。
- 本次排查不直接修改生产配置，不重跑真实付费模型。

## 用户现象

用户从已有行程提交“延长行程”优化后，页面最终显示“任务执行超时（超过 10 分钟），已自动终止，请重试”。目标任务标识在文档中脱敏为 `6a32…be52`，完整标识只保留在线上运行环境。

## 生产证据摘要

- `2026-07-16 17:46:09`：`OPTIMIZE` 开始执行。
- 执行期间 Nominatim 持续连接超时，坐标补全对大量 POI 串行等待和重试。
- `17:56:30`：10 分钟 watchdog 将任务写为 `FAILED`。
- `18:04:11`：原工作线程实际完成，摘要为 `durationMs=1081521`、`tokens=39112`、`dayCount=7`。
- 调度器发现任务已不是 `PROCESSING`，丢弃迟到成功结果。
- 数据库中的任务终态为 `FAILED` 且无结果；同一任务的 AI 调用记录为 `SUCCESS`。

以上只保留脱敏摘要；原始日志、数据库和用户行程不进入 Git 或 `docs/`。

## 根因判断

1. `TaskScheduler.watchdog()` 依据任务开始时间使用固定 10 分钟阈值更新终态，但没有向 `ai-task` 工作线程传播取消信号。
2. `ItineraryAiService.optimize()` 在返回有效 AI 结果前同步执行坐标和交通补全；本应可降级的地图能力因此进入核心成功路径。
3. `PoiCoordinateEnricher` 逐日、逐 POI 同步调用 Provider。Nominatim 不可达时，单次连接与读取超时、重试和限流等待按 POI 累计，48 个无效坐标足以超过任务预算。
4. 工作线程晚于 watchdog 完成时，只能在状态比较交换失败后丢弃结果；与此同时成功 AI 调用日志已经持久化，形成状态矛盾。
5. 用户看到失败后重试，可能与未真正终止的旧任务并行消耗模型 Token 和外部调用配额。

## 相关代码入口

- `apps/server/src/main/java/com/ai/travel/task/TaskScheduler.java`
- `apps/server/src/main/java/com/ai/travel/service/ItineraryAiService.java`
- `apps/server/src/main/java/com/ai/travel/service/PoiCoordinateEnricher.java`
- `apps/server/src/main/java/com/ai/travel/service/geocoding/GeocodingServiceImpl.java`
- `apps/server/src/main/resources/application.yml`

## 验收标准

- [x] Nominatim 不可达且存在大量 POI 时，坐标允许降级为空，用户仍能获得有效优化结果。
- [x] 达到真实任务 deadline 后，正在执行的链路停止后续 AI、地理编码和持久化工作，不产生迟到成功。
- [x] watchdog 与工作线程只有一个终态提交者，不再丢弃已经有效生成的结果。
- [x] `itinerary_task` 与 `ai_call_log` 的任务状态语义一致。
- [x] 自动化覆盖 48 个 POI 连续超时、watchdog 先完成和工作线程先完成三类边界。
- [x] 用户重试不会与未停止的旧任务继续并行消耗同一执行链路。
- [x] 保持任务用户归属校验，日志、测试和文档不写入真实用户资料或完整线上任务标识。

## 验证计划

- Server 单元测试：使用确定性假 Provider 和可控时钟验证超时、取消、降级和终态竞争。
- Server 集成测试：验证任务表与 AI 调用日志一致，失败路径不保存半成品。
- 浏览器回归：使用本地 AI/地图替身提交优化，验证成功结果、可恢复错误和重试入口。
- 门禁：`pnpm verify:server`、`pnpm test:e2e:server`、`pnpm test:e2e:smoke`、`pnpm lint`、`pnpm typecheck`。

## 回退

修复已通过不可变 Release 发布并完成目标环境复验；如需回退，重新部署修复前主干 `598d049` 或既有 `checkpoint-20260717-pre-large-change` 对应制品，不移动或覆盖标签。

## 本地验证结论

- 定向回归 137/137（含 TaskScheduler 16/16）通过；覆盖取消传播、48 POI 熔断、迟到成功丢弃与 DB 终态竞态。
- `pnpm verify:server`：655/655、Checkstyle 0、JaCoCo 门槛通过。
- `pnpm test:e2e:server`：37/37；`pnpm test:e2e:smoke`：11/11。
- `pnpm lint`、`pnpm typecheck` 与文档预算检查通过；Commit `6495d3e` 已 fast-forward 合入 `main`，生产环境尚未复验。
