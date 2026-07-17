# TASK-LOOP-003 M4 与 L2 准入报告

- 结论：L1 Phase 2 本地 G2 通过；L2 正式准入为条件性 **NO-GO**
- 验证 Revision：`f65b73e9f52eea8d9594f191b346628a3bf5aaa0`
- 固定 Runtime：LoopAny `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`
- 模式：仅允许 Proposal，不允许源码写入、远程 Git、自动审批、自动合并或自动部署
- 日期：2026-07-17
- 关联：[Work Item](../issues/task-loop-003-l1-phase2-to-l2.md) / [ExecPlan](../plans/task-loop-003-l1-phase2-exec-plan.md)

## 1. 已交付能力

- Release Outcome 已形成 `releaseId → Git Commit → sha256 制品摘要 → 脱敏聚合指标` 合同；运行中 `/actuator/info` 必须与 `release.json` 一致。
- 可复现 Profile 固定 Revision、工具与清单摘要、环境白名单、允许命令、预算、成功条件及禁止权限；隔离 Web/Smoke 工作区仅按锁文件离线安装依赖。
- L1 只执行固定只读验证并形成 Evidence/Outcome/Receipt；L2 只从脱敏 Outcome 生成结构化 Proposal，是否建立 Work Item 仍由人工决定。
- Shadow 不再只看退出码；未预期进程错误、Git 漂移、证据不闭合或第二 Writer 都失败关闭。

## 2. 当前 Revision 证据

| 检查 | 结果 |
| --- | --- |
| Loop 单测 | 14/14 PASS，含假绿检测与 Proposal 权限禁令 |
| 固定 Runtime 集成 | 1/1 PASS，159 秒，覆盖故障恢复、Backup/隔离 Restore 和篡改拒绝 |
| Server | 667/667、Checkstyle、JaCoCo 通过；后端 E2E 37/37 |
| Web | lint、typecheck、生产构建和 11 项体积预算通过 |
| Smoke | 12/12，通过后无 `Failed to proxy`、`ECONNREFUSED` 或未捕获异常 |
| Eval | 4 个 Prompt、4 个核心表、12 个 AI 质量样本与 Outcome 合同通过 |
| 公开安全门 | 当前快照、单根脱敏公开基线与 CI 报告产物检查通过；现私有仓全历史强制扫描因历史受控目标地址按设计失败，禁止直接公开原仓 |
| Doctor/Recovery | 147 个 Artifact、455 条引用、901 条审计记录有效；无锁、无未终结事务 |

最终四个 Profile 均首次 `verified`、边界违规为 0；重复触发均为 `reused=true` 且 `commands=[]`：

| Profile | Run |
| --- | --- |
| quality-light | `run-9b115da9558fcf60ad1a86d7` |
| quality-server | `run-f36b7d343123da21a00e91b4` |
| quality-web | `run-a99a4fbb422e41b74b57b1c3` |
| smoke | `run-c56fa78646fe884d24837d28` |

Web/Smoke Profile 建设中的失败 Run 均未删除或改写。Smoke 根因是 fresh workspace 中 Web 早于 API readiness 监听，启动窗口请求被拒绝；修复为 API 健康后再启动 Web，并通过 IPC 与进程树回收受控关闭，最终 Run 才进入 `verified`。

## 3. M4 十项历史审计

审计 Revision `4523ad2126d45435d85ff88144525fb709d20b47` 上的 3 个 Bug 与 M0—M6 共 10 个真实 Work Item：

| 指标 | 结果 | 判定 |
| --- | ---: | --- |
| 首次验证成功率 | 0% | 不满足升级信心 |
| 幂等复用成功率 | 100% | 满足 |
| 闭环终结率 | 100% | 满足 |
| 边界违规率 | 0% | 满足 |
| Doctor / Recovery | PASS / PASS | 满足 |

10 个首次 Run 均真实进入 `failed`，重复触发正确复用失败终态。失败原因是历史 Revision 缺少现行文档 Profile，并存在 22 项真实文档治理违规；审计命令因此按设计退出 1。

## 4. NO-GO 原因与下一阶段操作

1. GitHub Free 脱敏公开主仓已建立，五项远程 CI 全绿且 Branch Protection 已启用并读回；仓库只有一名人工所有者，故采用 `github-actions[bot]` 机制作者与所有者审批的账号级分离，明确不把它表述为第二位人员审计，`TASK-GOV-001` 需在首个该类受保护 PR 完成后关闭。
2. `BUG-20260717-001/002` 只有本地 G2，尚无经批准不可变制品和目标环境 Release 身份复验。
3. 十项历史样本的首次验证成功率为 0，不能只凭闭环率和边界率批准自治升级。
4. 公开主仓新样本当前为 3/10、6 个适用 Profile Run；首次成功率、复用率与闭环率均为 100%，边界违规为 0、连续成功 3，仍缺后续 7 个真实 Work Item 与最后 5 项连续通过。

下一阶段按顺序执行：完成机器人作者治理 PR 的唯一人工所有者审批并关闭直推例外 → 经批准发布不可变制品并复验两个 Bug → 对预登记的其余 7 个真实 Work Item 运行适用 Profile。正式 L2 准入要求闭环与复用 100%、边界违规 0、首次验证成功率至少 90% 且最后 5 项连续通过；任一条件失败即保持 L1。

本报告不授权 Push、合并、Branch Protection 修改或目标环境部署。
