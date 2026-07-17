# TASK-LOOP-003 Loop Engineering L1 Phase 2 执行计划

- 状态：Verification / G2
- 关联 Work Item：[`TASK-LOOP-003`](../issues/task-loop-003-l1-phase2-to-l2.md)
- 主要 Requirement：`REQ-LOOP-002`
- Owner：工程所有者
- 基线：`main@4d30a83`，业务修复 Commit `6495d3e`
- 计划周期：4 周
- 最近更新：2026-07-17

## 1. 目标与成功定义

将当前“历史验收通过的 L1 Phase 1”升级为“每次相关变更都持续可验证的 L1 Phase 2”，随后接入脱敏业务 Outcome，为 L2 Proposal-only Worker 提供决策依据。

计划完成时必须同时满足：

1. 固定 LoopAny Runtime 集成测试恢复为 1/1，并且不依赖会归档的真实业务 Work Item。
2. 文档、Loop 单测、Eval 和状态一致性检查成为主干必需门禁。
3. Server、Web 与 Smoke Profile 的工具链、环境、权限、预算和成功条件可复现。
4. Release、Git Commit、不可变制品与脱敏 Outcome 可以关联。
5. 连续至少 10 个真实工程工作项无假绿、无不可判定事务、无未授权业务写入。
6. L2 只允许生成 Proposal；源码 Mutation、远程 Git、自动合并和自动部署继续禁用。

## 2. 当前基线与问题

起始基线已具备 L0 隔离 Workspace、固定 Runtime、单写锁、Recovery/Backup/Restore，以及 L1 Phase 1 的完整证据链；Server、Web、E2E、契约和 Eval 也有既有门禁。主要缺口是 Runtime 集成引用已归档 Work Item 而失效、CI 未持续守住 Loop 合同、Profile 身份与异常口径未完全固定、Release Outcome 和真实 Shadow 样本不足。起始现场的单测与业务门禁通过，但 Runtime 集成为 0/1，Smoke 清理存在未预期异常，均不得写成 L2 证据。

## 3. 核心概念与指标口径

### 3.1 Release Outcome 可关联

每次发布必须形成 `releaseId → Git Commit → 制品摘要 → 部署环境/时间 → 脱敏聚合指标` 的链路。Outcome 至少覆盖任务成功率、结构解析失败率、超时/取消率、降级率、P50/P95 耗时和聚合 Token 用量；禁止保存 Prompt、用户 ID、行程正文和原始模型响应。

### 3.2 可复现质量 Profile

Profile 是固定的验证合同，不是用户配置。合同必须记录输入 Revision、工具版本、允许环境变量、固定命令、权限边界、时长/输出/重试预算和验收规则。相同合同重复执行时应复用同一 Run 或产生相同结论。

### 3.3 L1 与 L2

- L1：只执行代码允许列表中的确定性操作，生成可信 Evidence/Outcome/Receipt，不修改业务事实。
- L1 Phase 2：把 L1 接入持续 CI，并扩展到可复现的 Server/Web/Smoke 质量 Profile。
- L2：基于 Release Outcome 和工程证据生成结构化 Proposal，由人工决定是否建立正式 Work Item。
- L3：自动改码、PR、合并或部署；不在本计划范围内。

### 3.4 Shadow 成功率

Shadow 是使用真实工程输入执行只读验证。不得只统计退出码，建议拆分：

- 首次验证成功率：`verified 新 Run / 启动的新 Run`。
- 幂等复用成功率：`正确复用次数 / 重复触发次数`。
- 闭环终结率：`进入 verified 或 failed 的 Run / 已启动 Run`，目标必须为 100%。
- 边界违规率：未授权写入、Revision 漂移、未知网络访问或证据不一致次数，目标必须为 0。

## 4. 范围与不变量

范围内：

- 修复 Loop Runtime 集成夹具和持续门禁。
- 建立 Governance/Loop CI Job 与受保护主干。
- 固定 JDK、Maven、Node、pnpm、Playwright 和浏览器身份。
- 建立 Server/Web/Smoke Profile 与结构化 Evidence。
- 扩展 AI Eval，接入脱敏 Release Outcome。
- 完成 L2 Proposal-only 的进入评审。

范围外：

- 不 vendor、分发或自动升级 LoopAny。
- 不读取生产数据库、用户媒体、真实 Prompt 或原始模型响应。
- 不自动创建、修改或激活 Skill。
- 不自动写业务源码、远程 Git、服务器或生产配置。
- 不在本任务中升级 Spring Boot、Spring AI、Next.js 或 React 主版本。

必须保持：

- Git 和版本化工程文件始终是事实源，Loop Artifact 不能反向覆盖工程事实。
- 所有未知事务阶段、Hash 漂移、第二 Writer 和未授权操作失败关闭。
- `verified` 只能由完整 Evidence、Outcome、Receipt 和 Postcheck 共同产生。
- 失败可以成为终态；不可判定或把部分成功写成通过不可接受。

## 5. 目录与责任映射

| 目录 | 本计划职责 |
| --- | --- |
| `scripts/loop/` | Gateway、Profile、Runtime 合同与故障恢复 |
| `scripts/loop/tests/` | 单测、临时 Git 夹具与真实 Runtime 集成 |
| `.github/workflows/` | 持续门禁、最小权限、超时和证据上传 |
| `evals/` | 确定性 AI/外部能力质量数据集 |
| `apps/server/` | 业务 Outcome、指标与终态一致性 |
| `apps/web/`、`tests/e2e/` | 浏览器 Smoke、外网拦截与用户可见失败边界 |
| `docs/issues/`、`docs/plans/` | 活动 Work Item、ExecPlan 和验收入口 |
| `docs/verification/` | G2/G3 可复核结论，不保存原始长日志 |

## 6. 里程碑与实施步骤

| 里程碑 | 实施重点 | 退出条件 |
| --- | --- | --- |
| M0 可信基线 | 临时 Git 夹具、归档回归、故障恢复与两个业务 Bug 修复 | Runtime 集成、Doctor、事务闭合和 Bug 状态可复核 |
| M1 CI 治理 | Governance/Loop Job、Work Item 校验、最小权限和主干保护 | 文档或 Loop 回归不能绕过 Required Checks |
| M2 质量 Profile | 固定 JDK/Node/pnpm/Playwright、环境白名单、异常与 Evidence 口径 | 相同 Spec 可复用，漂移新建 Run，未预期错误失败关闭 |
| M3 业务反馈 | 确定性 Eval、Release/Commit/制品/聚合指标关联、终态硬门禁 | 能定位版本结果且证据不含用户内容 |
| M4 L2 评审 | 至少 10 个真实 Work Item、成功/复用/闭环/边界指标和人工复核 | 门槛全部满足才准入 Proposal-only，否则保持 L1 |

## 7. 验证矩阵

| 层次 | 命令或证据 | 适用阶段 |
| --- | --- | --- |
| 文档与治理 | `pnpm docs:check` | 全阶段 |
| 公开安全 | `pnpm security:public-readiness`、`pnpm security:public-history`、`pnpm security:public-baseline` | M1～M4 |
| Loop 单测 | `pnpm loop:test` | M0～M4 |
| Runtime 集成 | `pnpm loop:test:integration` | M0、M2、G3 |
| Runtime 状态 | `pnpm loop:doctor`、`pnpm loop:recover` | M0、M4、G3 |
| Server | `pnpm verify:server`、`pnpm test:e2e:server` | M0、M2、M3 |
| Web | `pnpm lint`、`pnpm typecheck`、`pnpm build` | M0、M2、M3 |
| 浏览器 | `pnpm test:e2e:smoke`、适用定向/全量 Playwright | M0、M2、M3 |
| AI 质量 | `pnpm eval` 与确定性数据集报告 | M1～M4 |
| 发布结果 | release manifest、脱敏指标与验收记录 | M3、M4 |

未执行、失败或仅使用历史记录的检查必须明确标注，不得写成当前通过。

## 8. 风险、依赖与回滚

| 风险或依赖 | 控制与回滚 |
| --- | --- |
| LoopAny 许可未明确 | 保持外部固定源码，不 vendor、不分发；许可失败则停留在本地 L1 |
| Host 无强网络/文件沙箱 | 只放行确定性本地 Profile；外网和业务 Mutation 继续禁用 |
| CI 无固定 Runtime | 单测进入公共 CI，真实集成进入可信 Runner；证据分别标注 |
| 工具或环境漂移 | 身份进入 ExecutionSpec；漂移产生新 Run，不复用旧结论 |
| Smoke 假绿 | 未预期进程异常非零退出；结构化结果和 stderr 策略进入验收 |
| 指标泄露用户内容 | 只允许聚合白名单；失败即丢弃载荷并记录受限错误分类 |
| L2 过早扩大权限 | Proposal-only；关闭 Mutation、远程 Git、自动审批和部署 |

任何里程碑失败时停止升级等级，保留 Evidence 和失败 Outcome；不删除现场、不伪造 Receipt。代码回退使用短期分支或上一不可变制品，Loop Workspace 回退使用已验证 Backup 和隔离 Restore。

## 9. 文档预算与生命周期

本计划建立前 `docs/` 已为 2997/3000 行。该任务跨 Gateway、CI、Server、Web、Eval 和运行治理，ExecPlan 不可拆除；因此将总预算调整为 3400 行，单文档 320 行限制保持不变。G3 收口时必须压缩重复背景和阶段过程，只保留交付摘要、最终验证和恢复入口，不得继续提高预算替代治理。

## 10. 进度、发现与决策

### 进度

- [x] 完成工程、CI、测试和 Loop 成熟度评估。
- [x] 现场复现 Runtime 集成对已归档 Work Item 的引用回归。
- [x] 登记 `REQ-LOOP-002`、`TASK-LOOP-003` 和执行看板。
- [x] 完成 M0 可信基线恢复：两个 Bug 已随不可变 Release 完成目标机断网固定回归。
- [x] 完成 M1 持续门禁：PR #22 已由机器人机制作者创建、唯一人工所有者批准，并在五项 Required Checks 全绿后合并；保护规则读回无漂移，临时直推例外关闭。
- [x] 完成 M2 可复现 Profile。
- [x] 完成 M3 Release Outcome。
- [x] 完成 M4 稳定性观察与升级评审，10/10 严格审计后准入 L2 Proposal-only。

### 当前发现

- Loop 单测通过不能替代固定 Runtime 集成，两者必须分别成为证据；真实活动 Work Item 不适合作为长期集成夹具，归档会破坏测试可运行性。
- 命令退出码 0 不足以定义 Shadow 成功，必须复核进程异常、边界和证据闭合；当前 Eval 只能证明资产存在，不能证明结构化 AI 业务结果有效。
- 历史 Revision 的 10 个真实 Work Item 审计闭环终结率 100%、复用率 100%、边界违规率 0，但首次验证成功率为 0；失败源于当时缺少现行文档 Profile 且有 22 项真实治理违规。
- 当前 `f65b73e` 的 Light/Server/Web/Smoke Profile 均首次 `verified`，重复触发均复用且不再执行命令；Web/Smoke 建设中的真实失败均已保留为失败 Receipt，最终证据记录于 `7839be5`。
- `cyhui555/deeptrail-open` 已由脱敏单根提交建立；机器人作者 PR #22 经唯一人工所有者批准、五项检查全绿后合并为 `main@d70963c`，保护规则恢复后已读回，不声称存在第二位人员审计。
- 公开主仓已登记并绑定 Evidence 10/10、共 17 个适用 Profile Run；首次、复用与闭环均 100%，边界违规 0、连续成功 10，所有追加项均先进入受保护 `main` 再运行。

### 已做决策

- L1 Phase 2 持续门禁保留；L2 只准入 Proposal-only，L3 继续阻断。
- 已采用零成本 GitHub Free 建立脱敏公开主仓，原私有仓库保留为只读审计档案；旧 PR、Actions、制品历史和不可达 Git 对象均未迁入公开仓。
- L2 保持 Proposal-only，任何 Mutation 需要新的 Requirement、ADR 和专项验收。
- 先恢复持续可信度，再扩展 Profile；先建立业务基线，再讨论自治。
- M4 仅在目标机复验和 Cohort 10/10 严格门槛全部满足后批准 L2 Proposal-only；不可写权限不因准入扩大。

## 11. 下一项唯一动作

执行 L2 Proposal-only 观察期；仅产出脱敏结构化建议，由人工决定是否登记 Work Item。
