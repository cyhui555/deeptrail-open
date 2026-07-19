# BUG-20260720-001 地理编码限流级联修复 ExecPlan

- 状态：G2（已合入，等待目标环境复验）
- 关联 Work Item：[`BUG-20260720-001`](../issues/bug-20260720-001-geocoding-qps-cascade.md)
- 关联 Requirement：`REQ-AI-001`、`REQ-UX-001`
- 合入：PR #67，`main@714a633`
- 最近更新：2026-07-20

## 目标

让规划与行程创建共用的地理编码链路在 5 QPS 边界内稳定工作，避免一次限流错误触发整批坐标缺失，同时保留既有连接故障熔断和任务可降级语义。

## 不变量

- 外部地理编码失败不阻断有效结构化行程。
- 每一次真实外部 HTTP 请求都必须计入对应 Provider 的全局 QPS。
- 只有 Provider 健康故障进入长熔断；配额限流不能伪装为 Provider 宕机。
- 缓存命中、目的地行政区/距离校验和任务取消边界不放宽。
- 测试不使用真实 Key、真实用户数据或付费外部请求。

## 实施步骤

1. 为 `GeocodingException` 增加限流分类，避免服务层依赖错误消息字符串决定熔断。
2. 将高德和 Nominatim 的令牌获取移动到每次真实 HTTP 尝试边界。
3. 高德解析 QPS 类错误码后执行一次完整窗口退避，并重新领取令牌重试。
4. 服务层对最终限流失败执行 Provider fallback，但不记录为健康熔断失败。
5. 补限流恢复、限流不熔断、连接故障仍熔断和多 POI 不中断回归。
6. 运行 Server 定向测试、完整门禁及文档检查。

## 验证

- `pnpm --filter @deeptrail/server exec mvn -B '-Dtest=ProviderIntegrationTest,GeocodingServiceImplTest,PoiCoordinateEnricherTest' test`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docs:check`
- `pnpm work-items:check`
- `git diff --check`

## 回退

回退异常分类、Provider 退避重试和服务层熔断判断即可；不修改 Schema、目标环境、第三方配额或用户数据。

## 进度

- [x] 已复核用户现象、5 QPS 运行配置和高德官方限流语义。
- [x] 已定位重试绕过令牌与限流误开长熔断两处放大点。
- [x] 完成实现与定向回归，相关测试 62/62 通过。
- [x] 完成完整门禁与 G2 结论；Server 681/681、移动端 2/2、lint、typecheck 与构建均通过。
- [x] PR #67 五项 Required Checks 全部成功并 squash 合入 `main@714a633`。

## G2 结论

- 每次真实 HTTP 尝试均在共享 Provider 限流器处领令牌，I/O 重试不再绕过 5 QPS 节奏。
- 高德 QPS 错误按独立失败类型处理：退避一个完整窗口后重试一次，最终失败只降级当前请求，不再开启 60 秒健康熔断。
- 连接故障仍沿用既有熔断，缓存、同城校验、deadline 和“坐标失败不阻断行程”语义未变。
- 当前结论来自确定性替身和整库门禁；未调用真实 Key、未修改账号配额，也未部署目标环境。

## 下一项唯一动作

发布 `main@714a633` 到受控验收环境，再用一条脱敏规划任务复验目标账号实际 QPS 与 POI 坐标补全率。
