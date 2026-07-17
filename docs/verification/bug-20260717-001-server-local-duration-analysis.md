# BUG-20260717-001 服务器与本地任务耗时差异分析报告

- 状态：分析完成；修复已合入主干，目标环境 G3 待执行
- 关联 Work Item：[BUG-20260717-001](../issues/bug-20260717-001-optimize-watchdog-race.md)
- 修复 Commit：`6495d3e`
- 发现版本：目标环境 `v0.2.0`
- 分析日期：2026-07-17

## 一、结论摘要

服务器任务与本地验证的耗时差距，主要由比较口径、真实外部依赖和部署版本不同共同造成。现有证据不支持“服务器 CPU 或内存性能不足”是首要根因。

1. 本地自动化默认使用确定性 AI、地图替身；服务器运行真实 LongCat 与 Nominatim，两者不是同一性能基准。
2. 服务器问题任务生成 7 天、`39,112` tokens；本地受控真实探针只生成 1 天、`7,525` tokens，输出量相差约 `5.20` 倍。
3. 服务器对约 48 个 POI 串行执行地理编码。Nominatim 持续连接失败时，单次超时、一次重试和退避可累计接近 9 分钟。
4. 生产日志中的 `durationMs` 覆盖 AI 调用、解析、坐标/交通补全和部分持久化，不是纯模型推理耗时。
5. `BUG-20260717-001` 修复已合入 `main@6495d3e`，但尚未部署；目标环境仍可能执行修复前的串行累计与无取消传播逻辑。

最终归因：

| 因素 | 判断 | 置信度 |
| --- | --- | --- |
| 本地替身与服务器真实链路不可直接比较 | 主要原因 | 高 |
| Nominatim 网络失败与逐 POI 串行累计 | 主要原因 | 高 |
| 7 天、39,112 tokens 的真实模型输出 | 重要原因 | 高 |
| 修复已合入但目标环境未部署 | 重要部署差异 | 高 |
| 服务器 CPU/内存不足 | 暂无直接证据 | 低，待目标机遥测 |
| SQLite 或普通 Web 请求性能 | 不足以解释 18 分钟 | 中高 |

## 二、比较边界

### 2.1 本地验证

全套浏览器和服务端自动化默认使用本地 AI、地图与确定性数据替身，不调用真实付费模型。受控真实 Provider 探针生成 1 天行程，返回 `7,525` tokens 并直接解析成功，但未保存完整端到端耗时。本地健康检查只验证 Web/API 可启动与响应，不能代表真实 7 天优化任务性能。

### 2.2 服务器问题任务

脱敏生产时间线：

| 时间 | 事件 |
| --- | --- |
| 17:46:09 | `OPTIMIZE` 开始 |
| 执行中 | Nominatim 持续连接超时，大量 POI 串行等待与重试 |
| 17:56:30 | 10 分钟 watchdog 将任务标记为 `FAILED` |
| 18:04:11 | 原工作线程结束，记录 `durationMs=1081521`、`tokens=39112`、`dayCount=7` |

服务器端到端执行约 `1,081.521` 秒，即约 18 分 2 秒。watchdog 只改变任务状态，旧实现未停止工作线程，迟到结果最终被丢弃。

## 三、计时口径拆解

当前代码存在两层计时：

| 指标 | 起止边界 | 含义 |
| --- | --- | --- |
| `AiChatGateway.latencyMs` | 调用 ChatClient 前至取得模型响应 | 接近纯 AI Provider 延迟 |
| `AiCallSummary.durationMs` | AI 编排开始至坐标、交通和成功审计准备结束 | AI + 解析 + 增强 + 部分持久化 |

因此：

```text
providerMs = AiChatGateway.latencyMs
postProcessMs ≈ AiCallSummary.durationMs - providerMs
```

`postProcessMs` 仍混合解析、地理编码、交通补全和数据库操作。缺少阶段级指标时，不能把 `durationMs=1081521` 直接解释为“模型推理 18 分钟”。

## 四、Nominatim 累计延迟估算

修复前配置与实现：

- 连接超时：3 秒。
- 读取超时：5 秒。
- 实际 HTTP 超时取两者最大值：5 秒。
- I/O 失败后重试 1 次，共 2 次请求。
- 两次请求之间退避 1.2 秒。
- Nominatim 限流为 1 QPS。
- 坐标补全按日、schedule、meals、accommodation 逐项串行执行。

单个 POI 的故障路径上界估算：

```text
5 秒 × 2 次 + 1.2 秒 = 11.2 秒
```

48 个 POI 的累计估算：

```text
48 × 11.2 秒 = 537.6 秒 ≈ 8 分 58 秒
```

该数值是按配置推导的故障路径估算，不是逐条生产日志实测和。它说明坐标补全单独就足以消耗接近整个 10 分钟任务预算；再叠加 39,112 tokens 的模型生成，18 分钟总耗时具有可解释性。

## 五、服务器硬件与部署判断

### 5.1 已取得证据

目标环境 `/api/health` 与 `/login` 本次公开探针分别约 `34.7 ms`、`28.9 ms`；生产 Compose 未配置显式 CPU、内存硬限制。基础入口没有表现出普遍性阻塞。本机对 Nominatim 的一次匿名探针在 TLS 阶段被重置，说明该外部链路存在不稳定风险，但单次探针不能代表长期可用率。

### 5.2 未取得证据

目标机 SSH 发布身份认证失败，本次未取得以下实时数据：

宿主机 CPU/load average/内存/swap、Server 容器 `docker stats`/重启/OOM、目标机到 LongCat/Nominatim 的分阶段网络耗时，以及同时段其他容器的资源争用情况。

因此不能完全排除宿主机资源争用，但现有证据不足以将其列为主要原因。

## 六、已合入但未部署的修复

`main@6495d3e` 已完成：

统一 `TaskExecutionContext` 与 deadline；watchdog/用户取消向工作线程传播中断；worker、watchdog 和用户取消竞争唯一终态；只有提交 `COMPLETED` 后才写 `SUCCESS` 审计；Provider 首次完整失败后短时熔断。自动化覆盖 48 个 POI 连续故障、两类完成顺序和 DB 终态竞争。

本地门禁记录为 Server `655/655`、Server E2E `37/37`、smoke `11/11`，但目标环境尚未执行 G3，不能据此声明服务器耗时问题已经消失。

## 七、验证与改进建议

### 7.1 目标环境 G3

1. 按不可变 release 流程发布包含 `6495d3e` 的主干版本。
2. 使用不含用户数据的确定性 48 POI 故障场景验证熔断和 deadline。
3. 确认任务超时后不再继续调用 Provider、写成功审计或产生迟到结果。
4. 再执行一次受控真实 Provider 小任务；记录调用范围和 Token 成本，不保存提示词或完整响应。

### 7.2 同口径性能对照

必须使用相同的脱敏请求、任务类型、天数、Provider、模型、输出上限和地理编码开关：

| 场景 | 目的 |
| --- | --- |
| 真实 AI + 关闭地理编码 | 得到纯模型端到端基线 |
| 固定 AI 响应 + 真实地理编码 | 隔离地图链路耗时 |
| 固定 AI 响应 + 故障地理编码 | 验证熔断和 deadline |
| 真实 AI + 真实地理编码 | 最终全链路验收 |

### 7.3 阶段级指标

建议在不记录用户内容的前提下增加：

- 阶段耗时：`queueMs`、`providerMs`、`parseMs`、`geocodeMs`、`transportMs`、`persistenceMs`、`totalMs`。
- 地理编码：`geocodeCount`、`cacheHitCount`、`providerFailureCount`、`circuitOpen`。
- 终态：`cancelReason` 与唯一终态提交结果。

## 八、最终判定

```yaml
primary_cause: external-real-chain-and-noncomparable-local-baseline
secondary_cause: serial-geocoding-timeout-accumulation
important_factor: large-real-model-output
deployment_difference: fix-merged-but-not-deployed
server-hardware-bottleneck: unproven
target-environment-g3: pending
```

服务器与本地差距巨大是可解释的，但当前数据仍不足以精确量化 LongCat 与宿主机资源分别占用多少时间。发布修复并补齐阶段级指标后，才能形成可持续的性能基线。
