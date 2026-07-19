# BUG-20260717-001 行程优化超时修复 ExecPlan

- 状态：Closed / G3（因 L2 Cohort 审计链接保留）
- 关联 Work Item：[`BUG-20260717-001`](../issues/bug-20260717-001-optimize-watchdog-race.md)
- 交付 Commit：`main@6495d3e`（由 `fix/BUG-20260717-001-optimize-timeout` fast-forward 合入）
- 基线：最新主干 `598d049`（初始诊断基线 `da147e8`）
- 最近更新：2026-07-17

## 目标

在不修改生产配置和外部 Provider 凭据的前提下，使任务 deadline 真正停止后续工作，并让可降级地理编码故障不再通过串行累计耗尽优化任务预算。

## 不变量

- `COMPLETED`、`FAILED`、`CANCELLED` 只能有一个终态提交者。
- 只有成功提交 `COMPLETED` 后才能写 AI 成功审计和生成行程副本。
- watchdog 不修改已经完成或取消的任务，也不覆盖成功结果。
- 地理编码无结果或 Provider 不可达时保留 AI 原坐标或空坐标，不阻断结构化行程。
- 用户取消和 watchdog 超时必须向当前工作线程传播中断；取消后不得继续重试或写成功审计。

## 设计

### 任务执行上下文

- 每次从 `PENDING` 认领任务时创建带单调时钟 deadline 的 `TaskExecutionContext`。
- `TaskExecutionRegistry` 保存上下文和对应 `FutureTask`；取消先写上下文原因，再中断工作线程。
- AI 网关、AI 编排和逐 POI 增强在阶段边界执行 checkpoint；超时或取消直接抛出专用异常，不进入普通失败重试。

### 终态提交

- 在 `InMemoryTaskStore` 内以单次原子转换同时写状态、结果、错误和完成时间。
- worker 先抢 `COMPLETED`；watchdog 先抢 `FAILED`。只有转换成功的一方执行对应持久化。
- AI 成功审计从 AI 编排阶段移到任务成功提交之后，避免任务失败但审计为成功。

### 地理编码降级

- Provider 自身完成既有一次 I/O 重试后若仍抛错，打开短时熔断。
- 熔断期间同批后续 POI 跳过该 Provider；`auto` 模式仍可使用其他未熔断 Provider。
- Provider 返回正常空结果不计为连接故障，避免把真实“无匹配”误判为宕机。

## 实施步骤

1. 增加执行上下文、取消原因、执行注册表和原子终态更新。
2. 调整 scheduler、AI gateway、AI service 与坐标增强的 checkpoint。
3. 将成功审计和生成行程持久化移到任务成功提交后。
4. 为地理编码 Provider 增加失败阈值与熔断时间配置。
5. 补 48 个 POI Provider 故障、watchdog 中断、迟到成功不落审计和用户取消回归。
6. 运行文档、Server 定向测试、完整 Server 门禁及适用前端静态门禁。

## 验证

- `pnpm docs:check`
- `pnpm --filter @deeptrail/server exec mvn -B '-Dtest=TaskSchedulerTest,TaskExecutionContextTest,PoiCoordinateEnricherTest,GeocodingServiceImplTest,ItineraryAiServiceTest,ItineraryTaskServiceTest' test`
- `pnpm verify:server`
- `pnpm test:e2e:server`
- `pnpm lint`
- `pnpm typecheck`

## 回退

- 修复已通过不可变 Release 发布并完成目标环境复验；可重新部署其父提交 `598d049` 对应制品进行回退。
- 后续如进入发布流程，使用不可变修复前 Commit 或 `checkpoint-20260717-pre-large-change` 构建回退制品，不移动既有标签。

## 进度

- [x] G0 生产证据与根因已复核。
- [x] 执行上下文、终态提交和 Provider 熔断方案已确定。
- [x] 实现与定向测试：137/137 通过。
- [x] 完整本地门禁：Server 655/655、E2E 37/37、smoke 11/11，lint/typecheck/覆盖率通过。
- [x] G3 验收记录：不可变 Release、目标机断网固定回归与故障恢复演练通过。

## G2 结论

- worker、watchdog 和用户取消使用统一上下文；取消原因先写入，再中断对应 Future。
- 内存与数据库终态均采用竞争提交，只有 DB 终态提交成功后才写 SUCCESS 审计。
- Provider 首次完整失败后短时熔断，同批 48 个 POI 不再重复累计连接超时。
- 实现已发布并完成目标环境 G3；固定样例覆盖 48 POI 熔断、取消传播、终态竞态与迟到成功抑制。
