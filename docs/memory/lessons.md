# 工程经验

仅保留已由代码或测试支持、能够跨任务复用的结论。

## LESSON-001：外部与 AI 输出进入业务状态前必须校验

- 状态：已确认
- 证据：`apps/server/src/main/` 的坐标、URL、AI 结构解析与用户归属校验；相关 Server 测试与 `evals/`
- 根因：模型、地图和网页内容不具备业务不变量，空值、伪坐标、外城结果和错误结构都可能格式合法。
- 结论：在独立边界校验结构、范围、归属和失败降级；禁止把外部文本、坐标或 URL 直接持久化或展示为权威事实。
- 验证：定向单元测试、契约测试和确定性 Eval 覆盖正常值、边界值与失败值。
- 晋升位置：`AGENTS.md`、测试、Eval
- 共享晋升：未申请

## LESSON-002：命令式 SDK 的初始化与 React 数据生命周期必须解耦

- 状态：已确认
- 证据：`apps/web/src/components/CheckinMap.tsx`、`apps/web/src/hooks/useAMapLoader.ts`、`tests/e2e/checkin-map-marker-lifecycle.spec.ts`、`tests/e2e/refresh-map-initial-state.spec.ts`
- 根因：地图实例、异步定位和 React effect 的到达顺序不同；不稳定回调或数组引用会重复初始化，晚到的有效坐标也可能被旧视野覆盖。
- 结论：SDK 单例加载，输入引用保持稳定；轨迹与定位分层更新，任何晚到的更高质量位置都能校正视野。
- 验证：刷新、延迟 SDK、延迟 GPS、切换日期和标记生命周期 E2E。
- 晋升位置：组件实现、E2E
- 共享晋升：未申请

## LESSON-003：首屏性能必须移除同步外部 I/O 与 N+1

- 状态：已确认
- 证据：`apps/server/src/main/java/com/ai/travel/service/CheckinQueryService.java`、`CheckinResponseAssembler.java`、`database/migrations/V3__optimize_trip_list_queries.sql`、`tests/e2e/trips-performance.spec.ts`
- 根因：读接口夹带地理编码、逐项媒体查询或缺少索引时，前端骨架优化无法保证一秒内可交互。
- 结论：列表/详情读取只访问必要本地数据，外部补全移出同步链路，批量装配关联数据，并用受控延迟验证预算。
- 验证：Server 查询测试与 Playwright 受控 300ms + 300ms 场景首屏小于 1 秒。
- 晋升位置：服务实现、数据库迁移、E2E
- 共享晋升：未申请

## LESSON-004：过程文档应作为恢复索引，不作为执行日志

- 状态：已确认
- 证据：`docs/process/documentation-governance.md`、`scripts/check-docs.mjs`
- 根因：Issue、计划、状态、复盘和中央记忆重复抄写会产生冲突，增加每次任务的上下文成本。
- 结论：活动任务保留详细记录，关闭后沉淀一行交付结论；当前状态和经验分离，能生成的契约不手工复制。
- 验证：`pnpm docs:check`
- 晋升位置：工程规范、lint
- 共享晋升：未申请

## LESSON-005：低频重能力应以用户动作作为加载边界

- 状态：已确认
- 证据：`PdfExportButton.tsx`、`check-overview-bundle.mjs`、`pdf-export-layout.spec.ts`
- 根因：把只在导出时使用的 `jsPDF`、`html2canvas` 静态导入，会让每次打开概览页都承担下载、解析与执行成本。
- 结论：低频、用户显式触发的重能力应在动作后动态加载，并同时保留交互回归与生产构建体积预算。
- 验证：概览页 First Load JS `275→112 kB`，点击后加载延迟分块并成功下载有效 PDF。
- 晋升位置：Web 实现、CI、Playwright
- 共享晋升：未申请

## LESSON-006：认证型 PWA 的离线能力必须先划定用户数据边界

- 状态：已确认
- 证据：`apps/web/public/sw.js`、`apps/web/src/lib/offlineSync.ts`、`apps/web/src/contexts/AuthContext.tsx`、`tests/e2e/smoke.spec.ts`
- 根因：缓存认证导航或 API 响应会在退出、切换账号和权限变化后泄露旧用户内容；无限离线队列也会放大存储和同步成本。
- 结论：Cache Storage 只保存公共壳与哈希静态资源，业务数据进入有上限的 IndexedDB 队列；退出和会话失效必须清理离线业务数据。
- 验证：离线公共壳、API 不缓存、认证路由不缓存和退出清理的代码门禁与浏览器回归。
- 晋升位置：Service Worker、认证上下文、离线同步与 E2E
- 共享晋升：未申请

## LESSON-007：敏感子资源接口必须在查询前复核父资源归属

- 状态：已确认
- 证据：`TrackController.java`、`TrackService.java`、`TrackServiceTest.java`
- 根因：父级行程接口已鉴权，不代表使用 `planId` 的轨迹、媒体等子资源会自动继承所有权校验；只按外部 ID 查询会暴露定位等敏感数据。
- 结论：每个敏感读写入口在访问子资源前校验父资源存在、未删除且属于当前用户；越权路径不得触发子资源查询。
- 验证：本人读取成功、他人读取抛出 `ForbiddenException`，并断言越权时轨迹 Mapper 零调用。
- 晋升位置：服务边界、Controller、权限测试
- 共享晋升：未申请

## LESSON-008：可重放写操作必须由稳定客户端标识与数据库原子约束共同保证幂等

- 状态：已确认
- 证据：`apps/web/src/lib/offlineSync.ts`、`apps/server/src/main/java/com/ai/travel/service/CheckinExecutionService.java`、`apps/server/src/main/java/com/ai/travel/service/TrackService.java`、`database/migrations/V4__add_offline_idempotency_keys.sql`、`apps/server/src/test/java/com/ai/travel/e2e/OfflineSyncE2ETest.java`、`tests/e2e/m14-offline-idempotency.spec.ts`
- 根因：客户端无法区分请求未到达与响应丢失；仅靠应用层预查在并发竞态、进程重启和多实例下仍可能重复写入。
- 结论：在首次发送前生成并持久化稳定标识，重放始终复用该值；服务端先校验资源归属，再以业务范围唯一索引、条件状态更新和冲突处理作为最终防线。派生计数只在状态跃迁成功后更新，新字段保持 nullable 以兼容旧客户端。
- 验证：真实 Spring → Controller → MyBatis → SQLite 重复提交、迁移与并发测试；浏览器以真实 IndexedDB v1→v2 升级证明首次发网前标识已落库，连接重置后队列保持一条，联网重试复用同键并清空。
- 晋升位置：客户端离线队列、服务边界、数据库 Schema、端到端测试
- 共享晋升：未申请

## LESSON-009：浏览器回归必须等待可观察状态，而不是等待时间经过

- 状态：已确认
- 证据：`tests/e2e/**/*.spec.ts`、`tests/e2e/lib/amap-mock.ts`
- 根因：固定延时只能证明时间经过，不能证明请求、渲染或第三方 SDK 已就绪；无语义的位置选择器会把页面歧义隐藏为偶发失败。
- 结论：优先等待可见状态、请求结果和应用就绪信号；测试桩应暴露确定性的 ready 标记。位置选择器只保留确实表达“第一个业务对象”的场景，并写明业务顺序语义。
- 验证：`waitForTimeout`、`force`、`networkidle` 扫描均为 0；仅保留 3 处业务顺序选择器；连续两轮全量 116 条 Playwright 均为 115 通过、1 条件跳过、0 失败。
- 晋升位置：Playwright 用例、测试桩、CI 门禁
- 共享晋升：未申请

## LESSON-010：时间协议必须显式归一，批次校验必须先于写入

- 状态：已确认
- 证据：`TrackService.java`、`TrackPointResponse.java`、`database/migrations/V5__normalize_track_recorded_at_to_utc.sql`、`TrackRecordedAtUtcMigrationTest.java`、`OfflineSyncE2ETest.java`
- 根因：无时区时间依赖部署机默认时区会产生漂移；逐点转换和写入交错时，后置非法值会留下半批数据。
- 结论：入口将 `Z` 或显式偏移统一归一为 UTC，历史无时区值按已知 UTC+08:00 语义解释，存储只表达 UTC，API 始终返回 `Z`；整批完成格式与范围校验后才允许写入。
- 验证：V5 迁移旧墙上时间且不重复偏移显式时区值；正常、偏移、旧格式、非法格式和极端 offset 均有单测，混合合法/非法贯穿批次失败且零新增。
- 晋升位置：时间协议、数据库迁移、批量写事务、端到端测试
- 共享晋升：未申请

## LESSON-011：结构化 AI 长输出必须使用模型官方最大上限

- 状态：已确认
- 证据：`apps/server/src/main/resources/application.yml`、`apps/server/src/main/resources/application-test.yml`、`AiOutputLimitConfigTest.java`、[LongCat Chat Completions 官方文档](https://longcat.chat/platform/docs/api/chat.html)
- 根因：测试 Profile 将 `max_tokens` 固定为 `4096`；真实 LongCat-2.0 在生成结构化行程时于 JSON 闭合前截断，解析器只能退化为空天数结果，形成“真实调用成功但行程不可用”的假成功。
- 结论：LongCat-2.0 的 `max_tokens` 默认必须使用官方上限 `131072`，所有 Profile 继承同一配置；更换模型前重新核对官方上限，不得沿用历史经验值。最大值只是输出上限，不代表模型一定生成同等长度，但能避免业务 JSON 被客户端配置提前截断。
- 验证：真实 Provider 一日行程探针在旧上限下复现截断；配置门禁断言默认与 test Profile 均为 `131072`。提升后真实复验返回 7525 tokens，`path=direct, status=success` 且 `dayCount=1`，本地 18080 替身关闭。
- 晋升位置：AI Provider 配置、真实连通性验收、结构化响应契约、项目与中央工程记忆
- 共享晋升：已同步中央工程记忆

## LESSON-012：地图消费者必须共享坐标就绪契约，地理范围必须匹配目的地粒度

- 状态：已确认
- 证据：`GeoUtils.java`、`CheckinCoordinateService.java`、`coordinates.ts`、`PdfExportButton.tsx`、`map-route-regression.spec.ts`
- 根因：把“川西”等宏观区域压缩为单个城市中心和固定半径会拒绝省内有效地点；页面、地图与 PDF 各自判断坐标有效性和加载时序时，会出现数据已可补全但地图未挂载、导出仍读取旧快照或交互状态割裂。
- 结论：服务端地理围栏按目的地粒度选择行政区或距离约束，明确出发节点只允许按请求中的出发地重试；前端所有地图消费者复用严格坐标校验。地图外壳和恢复入口不依赖坐标先存在，PDF 等动作型消费者必须在补全后重新读取数据再生成。
- 验证：宏观区域、出发节点与无关跨省结果有定向单测；无坐标每日地图、完整路线默认模式与双向联动、延迟补全后 PDF 地图有浏览器回归；真实高德行程坐标 13/13 且地图与 PDF 验收通过。
- 晋升位置：地理编码边界、地图组件、动作型导出、端到端回归
- 共享晋升：未申请
