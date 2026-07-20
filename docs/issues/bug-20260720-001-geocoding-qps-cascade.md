# BUG-20260720-001：规划转行程时 POI 坐标批量失败

- 状态：In Progress / G2（PR #67 已合入，等待目标环境复验）
- 优先级：P1
- 父任务：[`TASK-APP-001`](task-app-001-android-basic.md)
- 关联 Requirement：`REQ-AI-001`、`REQ-UX-001`
- ExecPlan：[`地理编码限流级联修复计划`](../plans/bug-20260720-001-geocoding-qps-cascade.md)
- 最近更新：2026-07-20

## 目标

修复规划结果补全 POI 坐标以及随后生成行程执行数据时，一次高德 QPS 拒绝导致同批大量地点经纬度为空的问题，并保持外部地图能力失败时不阻断结构化行程。

## 用户现象

- 用户确认第 3 项不是手机 GPS，而是“生成规划任务到行程”的过程中大量地点经纬度生成失败。
- 用户记得当前接口额度为 5 QPS；仓库运行配置也为 `app.geocoding.gaode-max-qps: 5`。
- 当前没有提交生产原始日志或真实任务数据；本次只使用脱敏仓库证据和确定性假 Provider 回归。

## 复现与根因

1. `GaodeGeocodingProvider` 只在进入一次地址或 POI 查询前领取令牌，发生 I/O 重试时第二次真实 HTTP 请求不再领取令牌；并发任务或四线程坐标刷新可因此短时越过进程内 QPS 节奏。
2. 高德返回 `CUQPS_HAS_EXCEEDED_THE_LIMIT` 等限流错误后，`GeocodingServiceImpl` 将其与连接故障同等处理。当前失败阈值为 `1`，第一次限流立即打开 60 秒 Provider 熔断。
3. 熔断按 Provider 全局共享；同批后续 POI 直接跳过高德，只能使用覆盖率较低且 1 QPS 的 Nominatim，因而表现为大量坐标同时缺失。
4. 高德官方说明 QPS 超限时只拒绝超出限额的请求，限额内请求仍可返回；因此把一次限流升级成 60 秒健康熔断会放大故障。

## 范围内

- 每次真实高德/Nominatim HTTP 尝试（包括 I/O 重试）都重新领取全局 Provider 令牌。
- 识别高德 QPS 类 `infocode/info`，执行一次有界退避与重新限流后的重试。
- QPS 拒绝在最终失败后允许 Provider fallback，但不打开 60 秒连接故障熔断；真实连接故障继续保持既有短路。
- 补 Provider、服务层和批量 POI 回归，证明一次限流不会让后续地点级联失败。
- 保持缓存、同城校验、任务 deadline 和“坐标失败不阻断行程”语义不变。

## 范围外

- 不读取、提交或打印真实高德 Key，不调用真实计费/限额接口。
- 不修改目标环境 Secret、账号配额或高德控制台配置。
- 不引入 Redis 等多副本分布式限流；当前修复针对既有单实例服务边界。
- 不把 AI 生成坐标重新作为可信来源，也不放宽跨城坐标校验。

## 验收标准

- [x] 高德地址查询、POI fallback 与每一次 I/O 重试均受同一个 5 QPS 令牌桶约束。
- [x] 首次 QPS 错误退避并重试后可恢复当前 POI，不直接降级整批地点。
- [x] QPS 重试仍失败时只降级当前请求并尝试备用 Provider，不打开 60 秒健康熔断。
- [x] 真实连接失败仍在既有阈值后熔断，48 个 POI 故障短路回归保持通过。
- [x] 规划坐标增强回归证明中途一次限流后后续 POI 仍可继续得到坐标。
- [x] Server 定向测试、完整测试、lint、构建、文档和 Work Item 门禁通过。

## 验证结果

- 地理编码定向测试 62/62 通过，覆盖 I/O 重试重新领令牌、高德 QPS 退避恢复、限流不熔断和批量 POI 继续补全。
- `pnpm test`：Server 681/681 通过；`pnpm lint`、`pnpm typecheck`、`pnpm build` 通过。
- `pnpm test:e2e app-mobile-regression.spec.ts`：2/2 通过，确认同一修复分支上的 360px 与 390px 端侧布局。
- `pnpm docs:check`、`pnpm work-items:check` 与 `git diff --check` 通过。
- PR #67 精确 Head `107c3a4` 的五项 Required Checks 全部成功，并 squash 合入 `main@714a633`；未部署。
- 未使用真实高德 Key 或生产任务；目标环境仍需在代码审查、合入与部署后，以脱敏规划任务复验实际配额和坐标补全率。

## 回滚

回退地理编码异常分类、Provider 重试与对应测试即可；不涉及数据库迁移、缓存结构、API 契约、目标环境配置或用户数据。
