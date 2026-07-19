# BUG-20260717-002 AI 行程 JSON 解析失败仍进入成功终态

- 状态：Closed / G3（已发布并完成目标机 117 项固定样例复验）
- 优先级：P1
- GitHub Issue：[cyhui555/deeptrail#24](https://github.com/cyhui555/deeptrail/issues/24)
- 关联需求：`REQ-AI-001`、`REQ-UX-002`
- 发现环境：目标环境 `v0.2.0`
- 最近更新：2026-07-17

## 目标

修复 AI 返回非法 JSON 时后端将解析兜底对象当作成功结果的问题，使任务终态、AI 调用日志、API 数据契约和前端展示保持一致。

## 范围

### 范围内

- 生成任务的 JSON 解析失败传播与成功结果结构校验。
- 解析失败后的受控重试或明确失败边界。
- 任务表与 AI 调用日志的终态一致性。
- 前端对无有效 `days` 的异常存量结果进行安全降级。
- 非法 JSON、空 `days` 和合法多日行程的自动化回归。
- 检查 `XIAOHONGSHU` 与 `OPTIMIZE` 是否存在相同兜底成功语义。

### 范围外

- 不实现无边界、依赖猜测的通用 JSON 修复器。
- 不切换 AI Provider 或模型。
- 不把真实生产任务、用户行程或完整模型响应写入仓库和测试夹具。
- 不在本 Bug 中直接改写历史生产任务数据；如需恢复，单独制定受控方案。

## 用户现象

AI 行程任务显示已经完成，但页面没有每日行程时间线，而是把大段 JSON 原文显示在“行程概览”中，同时仍暴露“加入行程”和“优化”等完成态操作。

## 生产证据摘要

- Provider 调用成功返回非空文本，模型输出包含类似 `"name":": "<POI名称>"` 的非法 JSON 字段。
- Jackson 在 `days[2].schedule[2].poi` 报告缺少对象字段分隔逗号。
- 解析日志依次记录 `direct=failed` 与 `fallback=success`。
- 任务外层 `result_json` 合法，但 `summary` 保存完整非法模型原文、`days=null`。
- 任务最终状态为 `COMPLETED`，AI 调用日志为 `SUCCESS`，摘要记录 `dayCount=0`。

以上只保留脱敏摘要；完整任务标识、原始响应、数据库内容和用户行程不进入 Git 或 `docs/`。

## 根因判断

1. `AiResponseParser.parseItinerary()` 捕获反序列化异常后返回兜底 `ItineraryResponse`，没有把解析失败传播给调用链。
2. 兜底对象把完整模型原文写入 `summary`，但不包含 `days`；调用链没有执行“成功结果必须包含有效日程”的业务校验。
3. `ItineraryAiService` 继续按成功保存行程和 AI 调用日志，`TaskScheduler` 将任意返回对象序列化后把任务标记为 `COMPLETED`。
4. 前端只用任务终态和 `result` 是否存在控制完成态操作，没有统一要求 `days` 有效；内容区又会把非空 `summary` 直接渲染。
5. 当前片段提取策略只能去除 JSON 外围说明或代码块，无法恢复对象内部的非法语法。

## 相关代码入口

- `apps/server/src/main/java/com/ai/travel/service/AiResponseParser.java`
- `apps/server/src/main/java/com/ai/travel/service/ItineraryAiService.java`
- `apps/server/src/main/java/com/ai/travel/task/TaskScheduler.java`
- `apps/web/src/app/(protected)/itineraries/[taskId]/page.tsx`
- `apps/web/src/components/ItineraryContent.tsx`

## 验收标准

- [x] 非法 JSON 响应不会产生 `COMPLETED + days=null`。
- [x] 受控恢复失败时，任务与 AI 调用日志均记录失败，错误信息不包含完整用户输入或模型响应。
- [x] 前端不会把非法模型原文当作“行程概览”渲染。
- [x] 无有效 `days` 时不能加入行程或继续优化，并提供明确的重试提示。
- [x] 合法多日行程仍能正常生成、展示、加入行程和优化。
- [x] `GENERATE`、`XIAOHONGSHU` 和 `OPTIMIZE` 的解析失败语义已检查并由定向测试覆盖。
- [x] 服务端定向测试、Web typecheck/lint 与 Playwright 定向回归通过。

## 验证计划

- Server 单元测试：输入确定性的非法字段、多余说明、空 `days` 与合法多日 JSON，验证解析和失败传播。
- Server 集成测试：验证任务表、AI 调用日志与持久化行程的成功/失败边界一致。
- 浏览器回归：使用本地 AI 替身返回非法 JSON，验证错误提示、重试入口和完成态操作禁用。
- 门禁：`pnpm verify:server`、`pnpm test:e2e:server`、`pnpm lint`、`pnpm typecheck` 和适用的定向 Playwright。

## 当前验证

- Server：`pnpm verify:server`，667/667，Checkstyle 与 JaCoCo 门槛通过。
- 后端 E2E：`pnpm test:e2e:server`，37/37 通过。
- Web：lint、typecheck 通过；生产模式 Smoke 12/12 通过，非法存量结果用例已覆盖。
- 修复已随 v0.2.0 发布，目标机 117/117 固定样例复验通过，旧私库 GitHub #24 已关闭。

## 回退

修复已进入不可变发布。若目标环境出现回归，回退应用制品并保留失败证据，不移动或覆盖既有正式标签；历史异常数据恢复仍需独立 Work Item。
