# 工程整体优化 PRD（历史归档）

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-07-05 |
| 状态 | 已实施 |
| 作者 | Claude Opus 4.7 + 项目组 |

---

## 一、背景与目标

### 1.1 项目现状

Spring AI 旅游行程规划应用 — Spring Boot 3.3 后端 + Next.js 14 前端。用户提交异步 AI 行程生成/优化/小红书任务，前端轮询获取结果。

### 1.2 现存问题

经过全面代码审查，发现以下系统性问题：

| 类别 | 问题 | 严重度 |
|------|------|--------|
| 双写一致性 | cleanup 只清内存不清 DB，cancel 失败时状态不一致 | 🔴 高 |
| 可观测性 | AI 调用降级路径无结构化统计，线上问题难定位 | 🔴 高 |
| 任务可靠性 | AI 调用失败直接标 FAILED，无重试，任务可能永久丢失 | 🟡 中 |
| 前端体验 | 固定 2s 轮询无退避，长时间 PENDING 浪费请求 | 🟡 中 |

### 1.3 优化目标

- 消除双写数据不一致的隐患（DB 为准原则）
- AI 调用全链路可观测（解析路径、重试事件、结构化汇总）
- 瞬时故障自动恢复（有限重试 + 死信兜底）
- 前端轮询自适应（指数退避 + 超时保护）

---

## 二、实施范围

### 2.1 本轮实施（已交付）

| # | 优化项 | 优先级 | 改动文件 | 改动量 |
|---|--------|--------|----------|--------|
| 1 | 双写一致性最小修复 | 🔴 高 | TaskScheduler, ItineraryTaskService, InMemoryTaskStore | ~30 行 |
| 2 | AI 调用可观测性轻量增强 | 🔴 高 | ItineraryAiService | ~50 行 |
| 3 | 调度器重试/死信机制 | 🟡 中 | TaskScheduler, ItineraryTask, schema.sql | ~60 行 |
| 4 | 前端轮询退步优化 | 🟡 中 | useTaskPoller.ts | ~35 行 |

### 2.2 后续规划（不在本轮）

- 多实例支持（Redis 替换 ConcurrentHashMap）
- Micrometer + Prometheus 指标暴露
- SSE/WebSocket 替代轮询
- CI/CD 流水线

---

## 三、详细设计

### 3.1 双写一致性修复

#### 3.1.1 设计原则

> **DB 为准（Source of Truth）**：数据库是权威的持久存储，内存仅作读加速缓存。写入顺序：先 DB 后内存。

#### 3.1.2 修改点

**A. cleanup 同步清理 DB（TaskScheduler.java）**

```java
// 修改前：只清内存
taskStore.delete(t.getId());

// 修改后：同时清 DB
taskStore.delete(t.getId());
taskMapper.deleteById(t.getId());
```

**B. processTask 异常保护**

DB 写入失败不阻塞主流程（内存已标记终态），仅记录错误日志。下次启动时 `StartupTaskLoader` 自动修复。

```java
try {
  taskMapper.updateById(task);
} catch (Exception e) {
  log.error("Failed to persist terminal status to DB for task {}, will be reconciled on next startup", ...);
}
```

**C. cancel 幂等处理**

DB 返回 0 行时检查内存是否已 CANCELLED，若是则视为成功（兼容并发取消场景）。

#### 3.1.3 多实例限制说明

已通过 Javadoc 明确标注 `InMemoryTaskStore` 仅适用单实例部署，多实例时需要替换为 Redis。

---

### 3.2 AI 调用可观测性增强

#### 3.2.1 新增结构化日志标记

| 标记 | 触发时机 | 示例 |
|------|----------|------|
| `[ParsePath]` | JSON 各解析阶段结束 | `path=direct, status=success` |
| `[Retry]` | IO 异常重试触发/结果 | `action=generate, taskId=xxx, reason=Connection reset` |
| `[AiCallSummary]` | AI 调用完成汇总 | `taskId=xxx, type=GENERATE, status=SUCCESS, durationMs=4320, tokens=2048` |

#### 3.2.2 日志样例

```
INFO  [ParsePath] path=direct, status=success
INFO  [AiCallSummary] taskId=abc123, type=GENERATE, status=SUCCESS, durationMs=4320, tokens=2048, dayCount=5, totalCostMs=4501
WARN  [Retry] action=generate, taskId=abc456, reason=Connection reset
INFO  [Retry] action=generate, taskId=abc456, result=success
WARN  [ParsePath] path=extract, status=failed
WARN  [ParsePath] path=fallback, status=success
```

#### 3.2.3 运维价值

- **解析成功率统计**：`grep '\[ParsePath\]' | grep 'success' | wc -l`
- **重试频率监控**：`grep '\[Retry\]' | grep 'reason=' | wc -l`
- **慢调用排查**：`grep '\[AiCallSummary\]' | awk -F'durationMs=' '{print $2}'`

---

### 3.3 调度器重试/死信机制

#### 3.3.1 设计

```
失败 → retryCount++ → 是否 < maxRetry?
                              │
                    是 ←───────┼───────→ 否
                    │                    │
              重置为 PENDING        标记为 FAILED
              (等待下次调度)        (死信，通知用户)
```

#### 3.3.2 配置项

```yaml
task:
  max-retry: 2   # 最大重试次数，默认 2
```

#### 3.3.3 数据模型变更

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| retry_count | INT | 0 | 已重试次数 |

#### 3.3.4 重试策略

- 第 1 次失败 → retryCount=1 → 重置为 PENDING → 等待下一次调度（~1s 后）
- 第 2 次失败 → retryCount=2 = max → 标记 FAILED，error_message 包含最终错误
- 死信日志标记：`[DeadLetter]` 前缀，便于告警规则匹配

---

### 3.4 前端轮询退步优化

#### 3.4.1 退避策略

```
初始 2s → 4s → 8s → 10s(上限)
```

| 轮询次数 | 间隔 |
|----------|------|
| 第 1 次  | 2s |
| 第 2 次  | 4s |
| 第 3 次  | 8s |
| 第 4 次+ | 10s (上限) |

#### 3.4.2 超时保护

总轮询时长超过 **5 分钟**自动停止，提示用户手动刷新或重新提交：

> "任务执行时间较长，已停止自动刷新。请稍后手动刷新或重新提交任务。"

#### 3.4.3 退避优势

- 短时间任务（<8s）用户体验不受影响
- 长时间任务（>30s）大幅减少请求量（从 15 次降到 6 次）
- 服务端压力降低

---

## 四、验收标准

### 4.1 已完成验证

| 验证项 | 方式 | 结果 |
|--------|------|------|
| 后端编译 | `mvn compile` | ✅ 通过 |
| 后端单测（79 个） | `mvn test` | ✅ 全部通过 |
| 前端 TS 类型检查 | `npx tsc --noEmit` | ✅ 通过 |

### 4.2 测试覆盖

| 场景 | 覆盖情况 |
|------|----------|
| cleanup 同步清 DB | 已有 TaskSchedulerTest `cleanupExpired` 用例通过 |
| processTask DB 写入失败 | 通过 try-catch 保护，无需新测试（非阻塞） |
| cancel 并发幂等 | 通过内存状态检查覆盖 |
| AI 调用重试机制 | 新增测试 `pollAndDispatchRetriesWhenAiThrowedThenFailsAfterExhaustion` ✅ |
| 重试计数递增 | 同上 ✅ |
| 死信标记 | 同上（验证 FAILED + completedAt） |

---

## 五、文件变更清单

### 后端（Java）

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `task/TaskScheduler.java` | 修改 | cleanup 增 DB 清理；processTask DB 写失败容错；增 max-retry 构造参数和重试逻辑 |
| `service/ItineraryTaskService.java` | 修改 | cancel 增加幂等检查；补充双写策略 Javadoc |
| `service/ItineraryAiService.java` | 修改 | 新增 logParsePath 方法；三级解析日志增强；callWithRetry 增加 taskId；三个公共方法出口增加 AiCallSummary 日志 |
| `entity/ItineraryTask.java` | 修改 | 新增 retryCount 字段 |
| `task/InMemoryTaskStore.java` | 修改 | 补充多实例限制 Javadoc |
| `resources/schema.sql` | 修改 | itinerary_task 表新增 retry_count 列 |
| `resources/application.yml` | 修改 | 新增 task.max-retry 配置 |
| `test/TaskSchedulerTest.java` | 修改 | 构造函数签名适配；新增重试测试用例 |

### 前端（TypeScript）

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `hooks/useTaskPoller.ts` | 修改 | ref 管理当前轮询间隔；指数退避（2s→4s→8s→10s）；5 分钟总超时 |

---

## 六、后续规划

### 6.1 中期（建议 1-2 周）

- **多实例支持**：引入 Redis 替换 `ConcurrentHashMap`，实现跨实例状态共享
- **Micrometer 指标**：暴露 `ai.calls.total`、`ai.parse.fallback`、`task.retry.exhausted` 等 Counter
- **SSE 推送**：task 状态变更时主动推送，减少无效轮询

### 6.2 长期（建议 1-2 月）

- **CI/CD 流水线**：GitHub Actions 自动化测试 + 构建 + 部署
- **结构化日志**：logback-spring.xml 配置 JSON 格式输出
- **前端 E2E 覆盖**：补充 AI 调用超时、JSON 解析失败等异常场景

---

## 七、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 重试机制可能放大 AI 服务压力 | 中 | 限制 max-retry 默认仅 2 次，配置可调 |
| 指数退避导致用户感知延迟 | 低 | 退避仅在后端进行，前端保持 2s 初期间隔 |
| DB retry_count 字段对老数据兼容 | 低 | DEFAULT 0，老数据自动为 0，行为不变 |

---

## 八、附录

### 8.1 配置项参考

```yaml
# application.yml
task:
  scheduler:
    interval-ms: 1000      # 调度器扫描间隔
  watchdog:
    interval-ms: 30000     # 看门狗扫描间隔
    timeout-minutes: 10    # 任务执行超时
  max-retry: 2             # 最大重试次数（新增）
  cleanup:
    interval-ms: 3600000   # 清理周期（1小时）
```

### 8.2 关键日志查询

```bash
# 统计解析成功率
grep '\[ParsePath\]' app.log | sort | uniq -c

# 查看死信任务
grep '\[DeadLetter\]' app.log

# 查看重试情况
grep '\[Retry\]' app.log

# 查看慢调用（>10s）
grep '\[AiCallSummary\]' app.log | awk -F'durationMs=' '{if(int($2)>10000) print}'
```

---

> Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
