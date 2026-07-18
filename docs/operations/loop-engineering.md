# Loop Engineering 本地操作手册

- 当前能力：正式公开 L2 Proposal-only；L3A 隔离 Worktree、固定 Commit/Push 与机器人 Draft PR 已激活并通过真实试点
- 不包含：业务写入、Daemon/Cron、自动 Skill Apply、自动审批/合并/部署和未准入的 L3B/L3C
- 架构：[Loop Engineering 落地方案](../architecture/loop-engineering-adoption-proposal.md)
- 验收：[TASK-LOOP-002 验收记录](../verification/task-loop-002-loop-contract-hardening.md) / [TASK-LOOP-003 交付摘要](../archive/task-loop-003-l2-proposal-admission.md) / [L3A 交付摘要](../archive/task-loop-004-l3a-controlled-execution.md) / [L3B 活动项](../issues/task-loop-006-l3b-controlled-merge.md)

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

L3B 当前仅有 [准入设计](../architecture/adr-loop-l3b-controlled-merge.md)，CLI 没有合并权限。人工使用 `gh pr merge` 不属于 Loop L3B 试点；在 Engine 与独立 activation 受保护合入前，不得用脚本、auto-merge 或管理员命令模拟通过。

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
