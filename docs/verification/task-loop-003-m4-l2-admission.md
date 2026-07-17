# TASK-LOOP-003 M4 与 L2 准入报告

- 结论：L1 Phase 2 持续门禁通过；L2 **Proposal-only GO**，Mutation 与 L3 继续阻断
- 验证样本 Revision：`d7023b7d0759850aa47d7f0086069cb63b447876`
- 固定 Runtime：LoopAny `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`
- 模式：仅允许 Proposal，不允许源码写入、远程 Git、自动审批、自动合并或自动部署
- 日期：2026-07-18
- 关联：[Work Item](../issues/task-loop-003-l1-phase2-to-l2.md) / [ExecPlan](../plans/task-loop-003-l1-phase2-exec-plan.md)

## 1. 已交付能力

- Release Outcome 已形成 `releaseId → Git Commit → sha256 制品摘要 → 脱敏聚合指标` 合同；运行中 `/actuator/info` 必须与 `release.json` 一致。
- 可复现 Profile 固定 Revision、工具与清单摘要、环境白名单、允许命令、预算、成功条件及禁止权限；隔离 Web/Smoke 工作区仅按锁文件离线安装依赖。
- L1 只执行固定只读验证并形成 Evidence/Outcome/Receipt；L2 只从脱敏 Outcome 生成结构化 Proposal，是否建立 Work Item 仍由人工决定。
- Shadow 不再只看退出码；未预期进程错误、Git 漂移、证据不闭合或第二 Writer 都失败关闭。

## 2. 当前 Revision 证据

| 检查 | 结果 |
| --- | --- |
| Loop 单测 | 17/17 PASS，含假绿检测、Cohort 追加约束与 Proposal 权限禁令 |
| 固定 Runtime 集成 | 1/1 PASS，159 秒，覆盖故障恢复、Backup/隔离 Restore 和篡改拒绝 |
| Server | 668/668、Checkstyle、JaCoCo 通过；后端 E2E 38/38 |
| Web | lint、typecheck、生产构建和 11 项体积预算通过 |
| Smoke | 12/12，通过后无 `Failed to proxy`、`ECONNREFUSED` 或未捕获异常 |
| Eval | 4 个 Prompt、4 个核心表、12 个 AI 质量样本与 Outcome 合同通过 |
| 公开安全门 | 公开仓当前 Tree/历史、单根基线、CI 报告产物与五项 Required Checks 通过；原私有仓仍不公开 |
| Doctor/Recovery | 140 个 Artifact、479 条引用、1826 条审计记录有效；无锁、无未终结事务 |

公开 Cohort 共 10 个真实 Work Item、17 个适用 Profile Run，严格审计结果如下：

| 指标 | 结果 |
| --- | ---: |
| 首次验证 / 幂等复用 / 闭环终结 | 100% / 100% / 100% |
| 边界违规 / 连续通过 | 0% / 10 |
| targetMet / thresholdsMet / cohortReady | true / true / true |

第 9 项为 `run-e0bf6b1b52610814935a5870`，第 10 项为 `run-fd3a14e493a4e803b14fd4fc`；两项均先登记到受保护 `main`，再首次 `verified`，重复触发同 Run 且 `commands=[]`。历史失败未删除或改写；本次目标脚本离线依赖失败按非零退出处理，修复后才重跑通过。

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

## 4. GO 依据与权限边界

1. PR #22–#31 实证机器人机制作者、唯一人工所有者审批、五项 Required Checks 和无管理员绕过的受保护合并；该证据不冒充第二位人员审计。
2. 受保护 `main@bc1ed2d` 已发布为不可变 Release；身份、镜像摘要、重启、外部入口和健康后故障注入自动恢复均通过。
3. 目标机固定 Maven 镜像先预热空测试，再在 `--network none` 容器运行 117/117 固定回归；无生产 Secret、真实 Provider、用户数据或付费调用。
4. 新 Cohort 达到 10/10：首次、复用、闭环 100%，边界违规 0，连续通过 10；46 份 Receipt、Runtime、Skill、事务和引用链全部可验证。

L2 仅可基于脱敏 Outcome 生成结构化 Proposal，由人工决定是否建立 Work Item；源码/远程 Git/服务器 Mutation、自动审批、自动合并、自动部署和 L3 均未授权。任一固定门槛、Runtime、证据完整性或权限禁令失败时立即回退到 L1。

本报告不授权自动 Push、合并、Branch Protection 修改、目标环境部署或付费调用。
