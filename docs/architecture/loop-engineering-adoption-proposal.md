# 旅迹 Loop Engineering 落地方案

- 状态：L1 Phase 2 持续门禁通过；L2 Proposal-only 已准入；Mutation 与 L3 阻断
- 事实入口：`REQ-LOOP-001`、[TASK-LOOP-002 交付摘要](../archive/task-loop-002-loop-contract-hardening.md)
- 运行入口：[本地运行手册](../operations/loop-engineering.md)
- 上游基线：LoopAny `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`
- 深层规范：deepbarin Loop Engineering runbook 与 G0—G3 工程门禁

## 目标架构

```text
Work Item + Git Commit + Profile
              |
              v
Deeptrail Loop Gateway
  runtime pin / admission / single-writer lock
  transaction manifest / verifier / receipt
              |
              v
LoopAny CLI + project LOOPANY_HOME
  artifacts / kinds / refs / audit / doctor
              |
              v
external workspace (skills, evidence, transactions)
```

LoopAny 负责通用闭环数据模型；deepbarin 规范约束工程阶段、证据、发布与恢复；旅迹 Gateway 只连接两者，不把业务系统改写成 LoopAny。

## 分层等级

| 等级 | 能力 | 当前决策 |
| --- | --- | --- |
| L0 | 固定运行时、项目隔离 Workspace、Skill 哈希、Doctor | 本任务交付 |
| L1 | 受控 Work Item 的确定性只读 Shadow、V0/V1、回执、幂等和分阶段恢复 | Phase 1 交付；业务反馈未接入 |
| L2 | AI Worker 产出结构化 Proposal，由人审后进入工程流程 | 已准入 Proposal-only |
| L3 | 自动 Worktree、修改、验证、PR/Merge 与发布 | 主干保护、许可和审批链完备前阻断 |

## 运行时与 Skill

- 日常运行显式提供 `DEEPTRAIL_LOOP_HOME`、`DEEPTRAIL_LOOP_BACKUP_ROOT`、`LOOPANY_SOURCE_ROOT`、`LOOPANY_BUN`。
- Gateway 校验源码 HEAD、工作树、Bun 与 CLI 版本；任何漂移都失败关闭。
- 允许同步 `loopany-resolver`、`loopany-core`、`loopany-capture`、`loopany-review`、`loopany-reflect` 的完整目录。
- 同步目标按上游 Commit 分版，生成逐文件 SHA-256；目标存在时只验证，不静默覆盖。
- 不同步全局注入，不自动拉取上游，不定时更新，不让 Skill 绕过 Work Item 和 G0—G3。

## 工程安全控制

- 单写锁位于外部 Workspace；锁内容包含进程、主机、仓库、分支和 Commit。
- 所有输入先解析真实路径，只允许当前 Git 根内受控文件，拒绝链接和路径逃逸。
- 每次写操作先落带 Hash 链的事务清单，按 `prepared/applying/source_committed/postchecking` 推进，最后原子写入不可变回执。
- 中断后不自动删锁或猜测完成状态；Doctor/Recovery 只给出可复核诊断。
- Shadow Profile 是代码内允许列表，不接受任意 Shell 命令。
- Backup 使用逐文件 SHA-256 Manifest；Restore 只能进入新隔离目录并重新通过 Skill、Kind、Identity 与 Doctor。

## Artifact 模型

保留 LoopAny 内置 `person/mission/task/learning/...`，新增：

- `run`：一次稳定输入与目标的闭环实例。
- `execution`：某一确定性 Profile 的执行状态。
- `execution-spec`：固定输入、Revision、Skill、Context、运行时、预算和权限的不可变合同。
- `evidence`：文件或命令结果的摘要、哈希与归属。
- `outcome`：Verifier 基于 Evidence 与 Receipt 判定的成功、失败或降级结果。
- `approval`：人工或门禁批准，不在本阶段自动生成通过结论。
- `transaction`：写步骤、状态和恢复点。
- `receipt`：不可含密钥和原始用户数据的结果摘要。

Run ID 来自完整 ExecutionSpec 摘要；其中包含 Work Item/Tree、Git Commit、Profile、固定 Skill、Runtime、Node/pnpm、预算和权限。Run 已存在时先复核终态链再复用；任一合同变化产生新 Run。

## Shadow Run

首个 Profile 只面向工程文档与 Gateway 自测：

1. 校验 Work Item 命名合规、已被 Git 跟踪并提交，且整个 Worktree clean、无路径逃逸。
2. 计算稳定 Run ID，创建或读取 Run。
3. 执行允许的确定性 pnpm 命令，采集退出码和受限输出摘要。
4. 创建 Task、ExecutionSpec、Execution、Evidence、Outcome 与 Receipt，并建立可遍历引用链。
5. V0/V1 核对 Git/mtime、Schema、摘要、终态、引用和 LoopAny Doctor；失败如实保留。

## 与 GitHub 和生产的关系

L0/L1 不写 GitHub、不改目标服务器，也不读取业务数据。后续 L2 只能生成 Proposal；L3 必须先满足受保护主干、Review/必需检查、不可变身份、审批与回滚。当前服务器“目标环境通过但完整生产未放行”的事实保持不变。

## 验收与升级条件

本任务以真实固定 LoopAny 运行时完成初始化、Skill/Kind/Identity 校验、Doctor、锁竞争、篡改失败、幂等 Shadow、四阶段故障恢复、半提交失败终结和隔离 Restore。该结论不包含业务反馈或治理进化；连续运行稳定后才审核 Proposal-only Worker，只有上游许可、GitHub 治理、预算和沙箱通过专项评审后才审核 L2/L3。
