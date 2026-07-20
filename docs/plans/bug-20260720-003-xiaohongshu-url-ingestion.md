# BUG-20260720-003 小红书链接摄取修复 ExecPlan

- 状态：G3（Draft PR #75，远程 CI 证据已建立）
- 关联 Work Item：[`BUG-20260720-003`](../issues/bug-20260720-003-xiaohongshu-url-ingestion.md)
- 关联 Requirement：`REQ-AI-001`、`REQ-UX-002`
- 基线：`origin/main@ae0700a`
- 最近更新：2026-07-20

## 目标

在不改变公开 API Schema 和模型供应商的前提下，修复裸短链误入模型与小红书当前页面状态无法解析两处故障，并以确定性测试证明链接失败时继续失败关闭。

## 不变量

- 只有 `xiaohongshu.com`、`xhslink.com` 及其子域名可以进入外部抓取。
- 抓取失败、正文为空或内容不足时不调用模型，不生成猜测行程。
- JavaScript 状态归一化只修改字符串外的独立 `undefined` 字面量。
- 普通粘贴正文及正文中附带的链接片段继续作为正文处理。
- 测试不保存真实用户数据、Cookie、Token、模型原文或生产日志。

## 实施步骤

1. 先增加服务端和 Playwright 失败回归，覆盖两条生产路径。
2. 前端在提交边界识别受支持的完整小红书 URL；服务端在信任边界再次识别绝对 URL。
3. 抓取器归一化 JavaScript `undefined`，优先从 `note.noteDetailMap.*.note` 读取标题和正文。
4. 保持 meta/HTML 降级与内容质量校验，补非目标 `desc` 和字符串内 `undefined` 回归。
5. 运行定向测试、完整门禁和一次无模型费用的原短链只读验证。

## 验证

- `pnpm --filter @deeptrail/server exec mvn -B '-Dtest=XiaohongshuContentFetcherTest,XiaohongshuContentServiceTest' test`
- `pnpm test:e2e:smoke`
- `pnpm security:evidence -- visual-evidence`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docs:check`
- `pnpm work-items:check`
- `git diff --check`

## 回退

回退本 Work Item 对应的前端提交归一化、服务端内容解析和测试；Schema、数据库、Provider 配置与目标机均无需回退。

## 进度

- [x] 已取得两个脱敏生产任务的分支选择、失败位置和终态证据。
- [x] 已确认原帖与页面内状态均为青岛内容，错误不来自来源笔记。
- [x] 已增加失败回归并证明旧实现不满足验收。
- [x] 已完成实现和定向验证。
- [x] 已完成 G2 本地门禁，修复已准备进入受检提交。
- [x] PR 最新 Head 的 Required Checks、脱敏截图 Artifact 与 Job Summary 已回填到受检证据。

## G2 结论

- 前端与服务端在各自信任边界识别完整 URL，裸短链不再以正文身份进入模型；正文内的链接片段仍按正文处理。
- 抓取器只归一化 JSON 字符串外的独立 `undefined`，并优先读取 `note.noteDetailMap.*.note`，不会被页面其他通用 `desc` 抢占。
- 域名白名单、内容质量阈值和失败关闭语义保持不变；原短链只读抓取已确认返回青岛内容且不调用 AI。
- Server 684/684、本地等价 PR smoke 16/16、脱敏截图 2/2、安全合同 22/22、lint、typecheck、build、Eval、文档及 Work Item 门禁全部通过。

## 下一项唯一动作

由工程所有者人工复核 Draft PR #75；受检合入后再由另行授权的受控部署验证新任务，不自动重算两个历史错误任务。
