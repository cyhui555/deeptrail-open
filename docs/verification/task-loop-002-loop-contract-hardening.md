# TASK-LOOP-002 Loop 工程合同验收记录

- 状态：PASS；本地 G0—G3、活动 Workspace、隔离 Restore、仓库门禁与 PR #19 远程 CI 均通过
- Requirement：`REQ-LOOP-001`
- 交付摘要：[TASK-LOOP-002](../archive/task-loop-002-loop-contract-hardening.md)
- ADR：[LoopAny Gateway ADR](../architecture/adr-loopany-gateway.md)
- 形态：L0 记忆侧车 + L1 Phase 1 确定性只读 Shadow
- Runtime：LoopAny `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5` / CLI `0.2.0` / Bun `1.3.14`

## 范围与结论边界

- 允许读取：Git 元数据、已提交 Work Item、固定配置、固定 LoopAny Source/Skill。
- 允许写入：项目外 Loop Home、Backup Root、隔离 Restore 和测试临时目录。
- 禁止：业务源码 Mutation、数据库/媒体/`.env`、AI/Provider、Daemon/Cron、远程 Git、服务器和 Skill 自动激活。
- Host：固定 pnpm Operation Adapter，`shell:false`；无 AI、无强网络沙箱，因此只执行 `docs:check` 与 Gateway 单测。
- 事实源顺序：Git 工程事实 → Loop 控制 Artifact；侧车不得反向覆盖工程事实。

## 三层 Loop 判定

| 层 | 本次实现 | 判定 |
| --- | --- | --- |
| 执行控制 | Admission → ExecutionSpec → 固定 Operation → V0/V1 → Outcome/Receipt → Transaction Recovery | L1 Phase 1 PASS |
| 业务反馈 | 未接入真实旅行 Outcome、基线或实验 | NOT READY |
| 治理进化 | 固定 Skill 只读同步；无 Learning 自动激活、回放或灰度 | NOT READY |

## Artifact 与合同

| 合同 | Version/摘要 | 实现 | 结果 |
| --- | --- | --- | --- |
| Run/Task/Execution/Outcome | LoopAny v0.2 + 旅迹 Kind | `scripts/loop/kinds`、`shadow.mjs` | PASS |
| ExecutionSpec | v1 / Canonical SHA-256 | `spec.mjs`、`execution-spec.md` | PASS |
| Transaction | v2 / 前序 Hash 链 | `transactions.mjs` | PASS |
| Receipt | v2 / 原子独占 + 完整性摘要 | `transactions.mjs` | PASS |
| Skill Manifest | 固定 Commit + 19 文件摘要 | `skills.mjs` | PASS |
| Approval/业务 Mutation | 本阶段无权限 | 代码级 `false` | N/A |

## G0：设计与授权

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Work Item、范围、Owner、验收、回滚 | PASS | 本工作项与 ExecPlan |
| L0/L1/L2/L3 选择 | PASS | L0 + L1 Phase 1；L2/L3 排除 |
| 三层 Loop 与 Domain Mapping | PASS | ExecPlan Domain Mapping |
| 事实源与唯一 Writer | PASS | Git 权威、项目外侧车、跨进程锁 |
| Risk/Operation/Budget | PASS | `loop.config.json` 与代码级禁令 |
| 外部服务/凭据/远程 Git | N/A | 未授权且子进程环境脱敏 |

## G1：实现与隔离

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Spec/Context/Skill/Runtime 可复现 | PASS | Spec 摘要包含 Commit/Tree/Skill/Node/pnpm/预算 |
| 第二 Writer 拒绝 | PASS | 单测 `WRITER_LOCKED` |
| Revision/Hash 乐观并发 | PASS | Clean Worktree + Commit/Tree/mtime 前后核对 |
| Agent 绕过 Committer | PASS（当前切片） | 只接受两个固定 pnpm Profile，无任意 Shell |
| 业务 Mutation/Outbox | N/A | 本阶段零业务写入 |
| 侧车双写 | PASS | Web/Server/数据库未接入 Loop Writer |

## G2：质量、安全与故障注入

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Schema/状态机/非法迁移 | PASS | Gateway 单测 12/12 |
| Skill/Receipt/Transaction 篡改 | PASS | 联合篡改与 Hash 链夹具均拒绝 |
| Profile/输出/时长/操作数预算 | PASS | ExecutionSpec 与 `runProcess` 硬上限 |
| Dirty Worktree/非法 Work Item | PASS | 真实集成拒绝夹具 |
| Secret 继承 | PASS | 子进程环境允许列表单测 |
| 仓库 lint/typecheck/test/build | PASS | 四项根命令均为 0；Server 647 项测试通过 |

## G3：影子、恢复与 Restore

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| U0 初始化/Doctor | PASS | 全新隔离 Home 17 Kind、固定 Skill、Mission |
| U1 只读 Shadow | PASS | 首次 verified，重复 reused，Git 状态不变 |
| 四事务阶段恢复 | PASS | prepared/applying 失败终结；source_committed/postchecking 继续核验 |
| applying 半提交 | PASS | Run 创建后故障可补齐失败闭环并终结 |
| 硬中断残留锁 | PASS | 死 PID + 精确 Token 清理；活 PID/错误 Token 拒绝 |
| Backup/Restore | PASS | 逐文件 Manifest；隔离 Restore Skill/Kind/Identity/Doctor 通过 |
| 兼容升级 | PASS | 15→17 Kind 前自动 Backup，仅补两个新 Kind |
| 活动 Workspace | PASS | 15→17 Kind 升级、Gateway Shadow、幂等复用、Doctor 与无残留恢复通过 |

## 当前量化结果

| 指标 | 目标 | 实际 | 结论 |
| --- | ---: | ---: | --- |
| Evidence/Receipt 可解析率 | 100% | 100%（隔离夹具） | PASS |
| 未授权业务写入 | 0 | 0 | PASS |
| 重复 Trigger 的重复 Run | 0 | 0 | PASS |
| 恢复后不可判定事务 | 0 | 0 / 5 类故障 | PASS |
| 篡改拦截率 | 100% | 100%（Skill/Receipt/Transaction/Backup） | PASS |
| Runtime 集成 | 通过 | 最终实现提交 1/1，约 98 秒 | PASS |

## 活动 Workspace 证据

| 对象 | 实际结果 |
| --- | --- |
| Loop Home | `E:\deep\deeplog\deeptrail-loop` |
| 升级前 Backup | `backup-20260716194349-ceed4e4c9841`；88 文件；Payload `ceed4e4c9841db4617e29a2e1fca218c52fbebf6bfbc5a194a8ae11c8dabe9b3` |
| 隔离 Restore | `E:\deep\deeplog\deeptrail-loop-restore-preupgrade-20260717`；旧版 15 Kind、25 Artifact、40 Ref、Doctor PASS |
| 当前 Shadow | `run-6d5523868d942d272e0e576f`；完整 Spec `6d5523868d942d272e0e576f90c182e210480e6a7434fa9e354cf4eb401c1ad5` |
| 幂等结果 | 首次 `verified`，再次 `reused: true`，Run ID 不变 |
| 当前 Doctor | 17 Kind、34 Artifact、69 Ref、191 Audit；全部检查通过 |
| 当前 Recovery | `writer: null`；`incompleteTransactions: []` |

## 仓库门禁证据

| 命令 | 结果 |
| --- | --- |
| `pnpm loop:test` | 12/12 PASS |
| `pnpm loop:test:integration` | 1/1 PASS；覆盖真实固定 Runtime、四阶段故障、半提交、残留锁、升级、Backup/Restore 和篡改拒绝 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS；Server 647 项，0 fail/error/skip |
| `pnpm build` | PASS；Server/Web 生产构建成功，只有既有的可选 `sharp` 提示 |
| `pnpm docs:check` | PASS；41 个 Markdown，处于行数与单文档预算内 |

## 风险与保留项

- LoopAny 上游许可证仍未明确，不 vendor、再分发或宣称生产授权。
- Host 没有强网络/文件沙箱；当前只允许无外部依赖的确定性检查，不能据此授权 AI 或业务写入。
- Search/Embedding 标记为关闭且未验证；L2/L3、业务反馈、治理进化和完整生产放行均为 `NOT READY`。
- GitHub 主干保护缺失仍阻断自动 PR/Merge。

## 最终判定

```yaml
local_sidecar_result: pass
execution_control_loop_phase1: pass
business_feedback_loop: not-ready
governance_improvement_loop: not-ready
production_release_status: not-ready
```
