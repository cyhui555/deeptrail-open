# Loop Engineering 本地操作手册

- 当前能力：正式公开 L2 Proposal-only；L3A 已激活并通过真实试点；Issue Intake 与 Work Item Proposal 均只读；L3B Engine 保持休眠
- 不包含：自动创建 Issue、任意代码生成、Daemon/Cron、自动 Skill Apply、自动审批/合并/部署和 L3C
- 架构：[Loop Engineering 落地方案](../architecture/loop-engineering-adoption-proposal.md)
- 验收：[TASK-LOOP-002 验收记录](../verification/task-loop-002-loop-contract-hardening.md) / [TASK-LOOP-003 交付摘要](../archive/task-loop-003-l2-proposal-admission.md) / [L3A 交付摘要](../archive/task-loop-004-l3a-controlled-execution.md) / [L3B 终止摘要](../archive/task-loop-006-l3b-controlled-merge.md)

## 1. 运行边界

Git 仓库仍是工程事实源；Loop Home 只保存工程控制 Artifact、事务和 Receipt。Shadow 只接受 clean worktree 上已提交的 `docs/issues/(task|bug|spike)-*.md`，并只执行仓库配置中的 `pnpm docs:check` 或 `pnpm loop:test`。任何 Dirty Worktree、版本/Skill/Kind/Mission 漂移、第二 Writer、未知事务阶段或 Hash 不一致都会失败关闭。

LoopAny CLI 的读操作也会追加上游 `audit.jsonl`，所以 `init`、`doctor`、Shadow、Backup、Restore 和 Recovery 写动作都由 Gateway 单写锁与外部事务包裹。不要直接运行全局 `loopany`，也不要手工修改 Workspace 制造通过结论。

## 2. 每个终端先设置环境

四个目录必须是绝对路径。Loop Home、Backup Root 和 Git 工作树不能互相包含：

```powershell
$env:DEEPTRAIL_LOOP_HOME = 'E:\deep\deeplog\deeptrail-open-loop'
$env:DEEPTRAIL_LOOP_BACKUP_ROOT = 'E:\deep\deeplog\deeptrail-open-loop-backups'
$env:LOOPANY_SOURCE_ROOT = 'E:\local-tools\loopany-src'
$env:LOOPANY_BUN = 'E:\local-tools\bun-1.3.14\npm\node_modules\@oven\bun-windows-x64\bin\bun.exe'
```

`E:\deep\deeplog\deeptrail-loop` 是旧私有仓的历史审计 Home，只用于兼容核验，不得作为公开 Cohort 运行目录。混用 Home 会把不同仓库的 Receipt/Evidence 错判为当前运行事实。

确认当前仓库和 Runtime：

```powershell
git status --short --branch
git -C $env:LOOPANY_SOURCE_ROOT rev-parse HEAD
& $env:LOOPANY_BUN --version
```

预期：工程工作树 clean；LoopAny Commit 为 `cdd1d08f4d3d5a09a49443ef1d7a698363ef06f5`；Bun 为 `1.3.14`。任一不符时停止，不执行写操作。

## 3. 首次初始化或从旧 Gateway 升级

```powershell
pnpm loop:init
pnpm loop:skills:verify
pnpm loop:doctor
pnpm loop:status
```

预期：

- `loop:init` 返回 `ok: true`、固定 Runtime、19 个 Skill 文件和 17 个 Kind；
- 重复 `loop:init` 只补缺和验证，不覆盖漂移文件；
- 从 `TASK-LOOP-001` 的 15 Kind Workspace 升级时，先自动生成 `preUpgradeBackup.backupId`，再只增加 `execution-spec.md` 与 `outcome.md`；
- Doctor 的 Workspace、Schema、Kind、Artifact、Reference、Onboarding 均通过；
- Capability 明确显示 Search/Embedding 未启用，Daemon/Cron/Socket/远程 Git/自动 Skill 激活被 Gateway 禁止；
- Status 没有 Writer 和未终结事务。

若旧 Workspace 升级时未设置 Backup Root，初始化会失败并保留事务。设置变量后先按第 8 节终结该失败事务，再重新执行初始化。

## 4. 创建并提交 Work Item

Shadow 不接受看板、归档或未提交文件。先建立真实 Work Item，完成 Review 后提交：

```powershell
$workItem = 'docs/issues/task-example-loop-check.md'
if (Test-Path -LiteralPath $workItem) { throw "Work Item 已存在：$workItem" }
@'
# TASK-EXAMPLE：Loop 工程检查

- 状态：In Progress
- Owner：工程所有者

## 目标

验证当前已提交 Revision 的 Loop 工程文档或 Gateway 检查。

## 验收标准

1. 固定 Profile 退出码为 0。
2. 重复执行复用同一 Run，且不修改业务源码。

## 回滚

本任务只执行只读检查；失败时保留 Evidence、Outcome 和 Receipt，不修改业务事实。
'@ | Set-Content -LiteralPath $workItem -Encoding utf8
git status --short
git add $workItem
$staged = @(git diff --cached --name-only)
if ($staged.Count -ne 1 -or $staged[0] -ne $workItem) {
  throw "暂存区不只包含当前 Work Item，请先处理：$($staged -join ', ')"
}
git commit -m "docs(loop): 建立工程检查工作项"
git status --short
```

如果已有符合规范的真实 Work Item，可跳过文件创建并替换后文路径。最后一条命令必须无文件输出。Work Item、Git Tree、Runtime、Skill Manifest、Profile、Node/pnpm 和预算共同生成 ExecutionSpec；任一合同字段变化都会生成新 Run。

## 5. 执行和复用 Shadow

文档 Profile：

```powershell
pnpm loop:shadow -- --work-item docs/issues/task-example-loop-check.md --profile docs
```

Gateway 自测 Profile：

```powershell
pnpm loop:shadow -- --work-item docs/issues/task-example-loop-check.md --profile gateway
```

首次成功预期 `reused: false`、`status: verified`；相同合同再次执行预期 `reused: true` 且 Run ID 不变。每个新 Run 必须形成以下引用链：

```text
Task → Run ← ExecutionSpec
          ← Execution ← Evidence ← Outcome ← Receipt
```

Task/Execution/Run 终态、Evidence/Outcome/Receipt 摘要和 LoopAny 引用由 V0/V1 Postcheck 复核。命令失败会生成失败 Outcome；Git 状态或跟踪文件 mtime 变化会把事务置为 `degraded` 并熔断，不会自动还原用户文件。

## 6. 日常状态与 Doctor

```powershell
pnpm loop:status
pnpm loop:recover
pnpm loop:receipts:verify
pnpm loop:skills:verify
pnpm loop:doctor
```

健康状态应同时满足：`writer: null`、`incompleteTransactions: []`、`unattestedLegacy: 0`、Skill Manifest 摘要稳定、Doctor `ok: true`。正式公开 Home 应全部为 v2；历史 Home 只允许 `receipt-compatibility.json` 精确登记且由固定 Backup 证明的 v1。`loop:recover` 在发现未完成项时会以退出码 1 返回，这是诊断结果，不代表应删除现场。

`pnpm loop:cohort:l2:strict` 成功时返回稳定 `admissionDigest`；它绑定 Cohort 样本、阈值与结果，但不包含持续追加的 Doctor Receipt/Audit 计数，供 L3 activation 精确登记。

### 6.1 只读 Issue Intake

```powershell
pnpm loop:intake -- --issue 41
```

Intake 只通过 GitHub GET 读取固定仓库的单个 Issue。Open Issue 只有同时满足可信请求者、`agent-ready` 标签，以及非空的“目标 / 验收标准 / 范围外 / 回滚”章节时才返回 `executable`；缺项返回 `proposal-only`，Closed 或 `not_planned` 返回 `terminal` 且不阻塞队列。输出只包含规范化元数据、缺项代码和正文 Hash，不返回正文，也不创建或修改 Issue、Git、PR、Loop Home 或部署。

### 6.2 Work Item Proposal

```powershell
pnpm loop:work-item-proposal -- --issue 77
```

该命令只在 clean `origin/main` 上处理 `executable` Issue，并额外要求标题含稳定 TASK/BUG/SPIKE ID、正文引用已登记 Requirement，且活动/归档中没有同 ID。四个必需章节被固定渲染为引用数据；输出只携带 Base64、内容 Hash、Issue Contract、主干 Revision、Registry 与现有 Work Item 摘要，不写文件、Git、PR 或 Loop Home。自动落盘和机器人 Draft PR 必须另行激活。

## 7. Backup 与隔离 Restore

创建逐文件 SHA-256 Backup，并从 JSON 读取 ID：

```powershell
$backupJson = pnpm --silent loop:backup
if ($LASTEXITCODE -ne 0) { throw 'Loop Backup 失败' }
$backup = $backupJson | ConvertFrom-Json
$backup.backupId
$backup.payloadDigest
```

Restore 只能写入一个不存在的新目录：

```powershell
$restoreTarget = "E:\deep\deeplog\deeptrail-open-loop-restore-$($backup.backupId)"
if (Test-Path -LiteralPath $restoreTarget) { throw "Restore 目标已存在：$restoreTarget" }
pnpm loop:restore -- --backup $backup.backupId --target $restoreTarget
```

预期 Restore 返回 `ok: true`，先证明 Manifest/文件集合/Hash 一致，再在隔离目录验证 19 个 Skill、17 个 Kind、Identity/Mission 和 LoopAny Doctor。Restore 不切换活动 Writer，也不覆盖原目录；隔离 Doctor 会在恢复副本追加 Audit，因此验收后副本摘要可以不同于原始 Payload，原始 Backup 保持不可变。

## 8. 中断与人工恢复

先读取恢复事实：

```powershell
$recoveryJson = pnpm --silent loop:recover
$recovery = $recoveryJson | ConvertFrom-Json
$recovery.lock
$recovery.incomplete | Format-Table id, operation, phase, action
```

### 8.1 清理硬中断残留锁

只有锁记录属于本机、精确 Token 匹配且 PID 已不存在时才允许：

```powershell
$lock = $recovery.lock
if (-not $lock) { throw '没有残留锁' }
Get-Process -Id $lock.pid -ErrorAction SilentlyContinue
# 上一条必须确认没有该进程；不要为了通过而终止未知进程。
pnpm loop:recover -- --clear-stale-lock $lock.token
```

活 PID、其他主机、错误 Token 或不可解析锁都会拒绝。旧锁会移入 `locks/quarantine`，并生成恢复事务与 Receipt。

### 8.2 `prepared/applying`：失败终结

```powershell
$item = $recovery.incomplete | Where-Object action -eq 'finalize-failed' | Select-Object -First 1
pnpm loop:recover -- --finalize-failed $item.id
```

该操作不重放未知步骤。若 Shadow 已产生部分 Artifact，Gateway 会补齐失败 Evidence/Outcome/Receipt 和必要引用，再将 Task/Execution/Run 显式终结为失败；初始化、Backup 或 Restore 的部分 staging 保留供诊断。

### 8.3 `source_committed/postchecking`：继续核验

```powershell
$item = $recovery.incomplete | Where-Object action -eq 'resume-postcheck' | Select-Object -First 1
pnpm loop:recover -- --resume-postcheck $item.id
```

该操作只复核已经提交的 Artifact、摘要、引用、Backup/Restore 或 Doctor，并补写关闭 Receipt；不会重新执行 Profile。任一 V0/V1 不一致时继续熔断。

恢复后必须再次确认：

```powershell
pnpm loop:recover
pnpm loop:doctor
```

## 9. 本地验收命令

普通单测不需要 LoopAny Runtime：

```powershell
pnpm loop:test
```

真实集成测试要求当前工程 clean，并设置 `LOOPANY_SOURCE_ROOT`、`LOOPANY_BUN`；测试会在系统临时目录创建独立 Home/Backup/Restore，覆盖四个事务阶段、半提交、残留锁、幂等和篡改拒绝：

```powershell
pnpm loop:test:integration
```

仓库门禁：

```powershell
pnpm governance:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 10. L3A 隔离 Draft PR

先额外设置项目外 Mutation Root；它不能与仓库、Loop Home 或 Backup Root 互相包含：

```powershell
$env:DEEPTRAIL_LOOP_MUTATION_ROOT = 'E:\deep\deeplog\deeptrail-open-l3-worktrees'
```

ChangePlan 与固定 Hash 的 `.patch` 必须同处 `$env:DEEPTRAIL_LOOP_HOME\proposals`。当前 `l3-policy.json` 的 L3A activation 由机器人 Engine PR #36 和独立 activation PR #37 建立，绑定最终批准 Head、对应 main 合入 Revision、稳定 L2 Cohort 摘要和 Review URL；运行时通过 GitHub API 复核这些事实，任一漂移都拒绝。任何权限变化仍必须先回到默认关闭，并经新的 Engine 与 activation 审批链。

```powershell
pnpm loop:l3:preflight -- --plan task-example-l3.json
pnpm loop:l3:run-draft -- --plan task-example-l3.json
```

L3A 只接受 `apps/`、非治理 `docs/`、`evals/`、`tests/` 的普通文本变更；禁止 `scripts/`、治理文档、CI、依赖、部署、迁移、Secret 和生产配置。Profile 使用空 Home/AppData、离线 Store、禁用 dependency lifecycle scripts；提交不运行 Git Hooks。严格 Cohort 在 recorded-operation 内只忽略同进程、同操作、精确 Token/Transaction ID 与 Revision 一致的当前 L3 事务，其他 Writer 或未终结事务继续阻断。发布只推送新 `agent/l3/*` 分支并触发 `automation-pr-author.yml` 创建 `github-actions[bot]` Draft PR，实际 Head 必须等于隔离 Commit。

失败后不要删除现场或重推。先执行 `pnpm loop:recover`：`prepared/applying` 按失败终结并保留 Worktree/分支；已完成发布但 Postcheck 中断时才允许 `resume-postcheck`。自动审批、合并和部署始终为 `false`。

### 10.1 休眠的 L3B 受控合并 Engine

Engine 提供以下历史命令，但 activation PR #44 已关闭未合入、GitHub #41 已终止，仓库内 `l3b-policy.json` 固定为 `l3b-disabled`，因此两者都必须失败关闭。定时任务不得调用或重新激活：

```powershell
pnpm loop:l3:merge-preflight -- --plan task-example-l3b.json
pnpm loop:l3:merge-approved -- --plan task-example-l3b.json
```

MergePlan 必须位于项目外 `proposals`，逐项绑定 L3A Transaction/Receipt/ChangePlan/Patch、机器人 PR 的单一 Head Commit、五项成功 Check Run、人工批准和保护规则。写入前会立即二次取证，只允许普通 expected-Head squash merge；不转 Ready、不提交 Review、不使用管理员/auto-merge、不删分支且不部署。

若 merge 响应丢失，`loop:recover` 只给出 `resume-postcheck`；不得 `finalize-failed` 或直接重试。恢复会先只读判断精确 merge commit/main/Tree/PR/部署事实，证明已合并则闭环，证明未合并则失败终结并要求新的完整 preflight，不一致则保留现场人工审计。

## 11. 脱敏公开主仓启动

现私有仓历史不得直接公开。只有源工作树 clean、治理总门禁通过且输出目录不存在时，才生成不带远端、旧引用或不可达对象的单根公开基线：

```powershell
pnpm governance:check
$publicBaselinePath = 'E:\path\deeptrail-public-baseline'
pnpm security:public-prepare -- --output $publicBaselinePath
```

公开主仓已建立并应用 `.github/branch-protection-main.json`。仓库只有一名人工维护者：受信任的手工工作流把锁定 SHA 复制为 `github-actions[bot]` 作者的 Draft PR，唯一人工所有者负责批准，证明 PR 作者外审批门禁；这只是账号级职责分离，不等价于第二位人员审计。PR #22 已完成首个实证并关闭 `TASK-GOV-001`；原私有仓继续保留为审计档案，两个仓库不得互设 Remote 或推送旧历史。

## 12. 停止、回退与禁止事项

- 停止：不再调用 pnpm Loop 命令即可；本实现没有常驻进程。
- 回退前：确认无 Writer，创建并验证 Backup，在新目录 Restore + Doctor；不要把旧代码直接写入新 Schema Workspace。
- 禁止：直接使用全局 `loopany`、覆盖 Backup、递归删除未知事务、自动重放 `applying`、把 Restore 切换为活动目录、把 Shadow 失败改写成成功。
- 禁止：在 Loop Artifact、Receipt、文档或 Git 中保存 `.env`、Token、Cookie、完整日志、业务数据库、媒体或真实用户内容。
- L2 Proposal-only 必须持续满足严格 Cohort；L3 权限按 [ADR](../architecture/adr-loop-l3-staged-automation.md) 分段准入，L3A 不能推导自动合并、部署或生产授权。
