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

已具备：

- L0 项目隔离 Workspace、固定 Runtime、单写锁、Doctor、Recovery 和 Backup/Restore。
- L1 Phase 1 的 ExecutionSpec、Evidence、Outcome、Receipt、事务 Hash 链和只读 Profile。
- Server 90% 行覆盖率门槛、后端 E2E、Playwright、OpenAPI Contract、确定性 Eval 和前端体积预算。

本计划开始前的现场结果：

| 检查 | 结果 |
| --- | --- |
| `pnpm docs:check` | 45 个 Markdown、2997 行，PASS |
| `pnpm loop:test` | 12/12 PASS |
| `pnpm loop:test:integration` | 0/1 FAIL |
| `pnpm verify:server` | 655/655、JaCoCo 门槛 PASS |
| `pnpm test:e2e:server` | 37/37 PASS |
| Web typecheck/build | PASS |
| `pnpm perf:check` | 11/11 PASS |
| `pnpm test:e2e:smoke` | 11/11 PASS，但清理阶段存在未预期 `ECONNRESET` 日志 |

Runtime 集成失败的直接原因是 `scripts/loop/tests/integration.test.mjs` 硬编码引用已经归档的 `docs/issues/task-loop-002-loop-contract-hardening.md`。这证明成功路径曾经通过，但归档后的持续可运行性没有被 CI 守住。

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

### M0：恢复可信基线（第 1～3 天）

1. 集成测试在系统临时目录创建独立 Git clone 或 worktree。
2. 测试生成、提交专用 Work Item，再执行 dirty 拒绝、Shadow、幂等、故障恢复和 Restore。
3. 测试结束只清理已验证位于临时根目录内的资源，不操作业务工作树。
4. 增加归档生命周期回归，禁止再次引用真实活动 Work Item。
5. 发布包含 `6495d3e` 的不可变 Revision，目标环境复验 `BUG-20260717-001`。
6. 完成 `BUG-20260717-002` 的非法 JSON 失败传播和前端安全降级。

退出条件：Loop 单测 12/12、Runtime 集成 1/1、Doctor PASS、Recovery 无 Writer/未终结事务；两个活动 Bug 均进入明确验证或关闭状态。

### M1：CI 与主干治理（第 1 周）

1. 新增 `Governance and Loop quality` Job，运行 `docs:check`、`loop:test`、`eval` 和状态一致性检查。
2. 校验 Work Item 的 ID、状态、Requirement、验收和回滚字段。
3. 校验看板链接、活动文件与归档引用，不允许失效路径进入主干。
4. Workflow 设置 `permissions: contents: read` 和每个 Job 的 `timeout-minutes`。
5. 真实 Runtime 集成先在可信本地或专用 Runner 执行；许可明确前不分发上游源码。
6. 关闭或提前终止 `TASK-GOV-001`，恢复短期分支、Pull Request、Review 和必需检查。

退出条件：文档或 Loop 回归无法绕过必需检查进入 `main`；主干禁止 force-push 和直接删除。

### M2：可复现质量 Profile（第 2 周）

1. 增加 Maven Wrapper，固定 JDK distribution/version。
2. 固定 Node、pnpm、Playwright 和浏览器版本，将身份写入 ExecutionSpec。
3. 只允许显式环境变量进入子进程；验收构建不得隐式消费开发者 `.env.local`。
4. 修复 Smoke 清理阶段未预期异常；进程级异常必须返回非零退出。
5. Playwright 默认阻止非 loopback 网络，真实外部验证必须独立授权。
6. 增加 `quality-light`、`quality-server`、`quality-web` 和 `smoke` Profile。
7. Evidence 记录结构化测试统计、错误分类、stdout/stderr 摘要和边界检查结果。

退出条件：相同 ExecutionSpec 可复用；环境或工具漂移产生新 Run；未预期错误不能被退出码 0 隐藏。

### M3：业务反馈闭环（第 3 周）

1. Eval 覆盖合法多日、非法 JSON、空 `days`、截断、超时、取消、地理编码降级和三类任务语义。
2. 建立 Release/Commit/制品与聚合指标关联。
3. 结构化结果硬门禁：有效样本解析率 100%，非法样本假成功率 0。
4. 终态硬门禁：`COMPLETED + invalid result` 为 0，超时后的 Provider 调用和业务写入为 0。
5. 指标异常仅生成 Proposal 候选，不直接修改业务事实。

退出条件：能够回答“哪个版本引入或修复了哪个业务结果”，且证据不包含真实用户内容。

### M4：稳定性观察与 L2 评审（第 4 周）

1. 选择至少 10 个真实工程工作项执行 Shadow。
2. 统计首次成功率、复用成功率、闭环终结率、边界违规率和人工恢复时间。
3. 复核失败是否真实、Proposal 是否有证据、人工拒绝原因是否可解释。
4. 只有主干保护、许可、沙箱、预算和业务基线全部满足时，评审 L2。

退出条件：闭环终结率 100%、边界违规率 0、连续 10 个工作项无不可判定事务；否则保持 L1 并建立修复任务。

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
- [ ] 完成 M0 可信基线恢复：实现与本地验证完成，等待两个 Bug 的目标环境证据。
- [ ] 完成 M1 持续门禁：脱敏公开主仓、五项远程 CI 与主干保护已落地；等待唯一人工所有者批准机器人作者 PR并关闭临时直推例外。
- [x] 完成 M2 可复现 Profile。
- [x] 完成 M3 Release Outcome。
- [x] 完成 M4 稳定性观察与升级评审，结论为条件性 NO-GO。

### 当前发现

- Loop 单测通过不能替代固定 Runtime 集成；两者必须分别成为证据。
- 真实活动 Work Item 不适合作为长期集成夹具，归档会破坏测试可运行性。
- 命令退出码 0 不足以定义 Shadow 成功，必须复核进程异常、边界和证据闭合。
- 当前 Eval 只能证明资产存在，不能证明结构化 AI 业务结果有效。
- 历史 Revision 的 10 个真实 Work Item 审计闭环终结率 100%、复用率 100%、边界违规率 0，但首次验证成功率为 0；失败源于当时缺少现行文档 Profile 且有 22 项真实治理违规。
- 当前 `f65b73e` 的 Light/Server/Web/Smoke Profile 均首次 `verified`，重复触发均复用且不再执行命令；Web/Smoke 建设中的真实失败均已保留为失败 Receipt，最终证据记录于 `7839be5`。
- `cyhui555/deeptrail-open` 已由脱敏单根提交建立，`main@daab55f` 的引导 PR 五项检查全绿且保护规则恢复后已读回；仓库只有一名人工 Collaborator，采用机器人机制作者与所有者审批，不声称存在第二位人员审计。
- 公开主仓新样本 3/10、6 个适用 Profile Run：首次成功率、复用率与闭环率均为 100%，边界违规 0、连续成功 3；追加式 Cohort 合同由锁定 SHA 的机器人作者 PR 复核。

### 已做决策

- 下一阶段目标为 L1 Phase 2，不直接进入 L2/L3。
- 已采用零成本 GitHub Free 建立脱敏公开主仓，原私有仓库保留为只读审计档案；旧 PR、Actions、制品历史和不可达 Git 对象均未迁入公开仓。
- L2 保持 Proposal-only，任何 Mutation 需要新的 Requirement、ADR 和专项验收。
- 先恢复持续可信度，再扩展 Profile；先建立业务基线，再讨论自治。
- M4 不因闭环和边界指标达标而自动批准 L2；机器人作者 PR 尚未获所有者批准、目标环境未复验期间保持 L1，L2 仅保留不可写 Proposal 能力。

## 11. 下一项唯一动作

由唯一人工所有者审核 `github-actions[bot]` 创建、锁定源 SHA 且五项检查全绿的治理 PR，以 API 和实际合并证明账号级保护链并关闭 `TASK-GOV-001`；这不宣称第二位人员独立审计，随后创建两个 Bug 的目标环境发布验证，再完成其余 7 项预登记真实 Work Item 样本。
