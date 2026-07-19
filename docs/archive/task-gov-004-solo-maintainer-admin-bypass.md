# TASK-GOV-004 单维护者管理员人工旁路摘要

- 状态：G3 / Closed
- Requirement：`REQ-GOV-002`
- 决策：Agent 可以复用工程所有者 GitHub 身份创建 PR；作者无法为自己的 PR 生成 `APPROVED` Review，因此唯一所有者在完成人工复核后可以显式执行管理员合并。
- 交付：`.github/branch-protection-main.json` 设为 `enforce_admins=false`，治理检查要求显式声明该模型，并以 ADR 固化自动化禁用边界。
- 等价控制：常规路径仍保留五项严格 Required Checks、一项作者外 Review、最后 Push 审批、线性历史和对话解决；管理员旁路前人工核对精确 Head、Checks 与未解决对话。
- 验收：`pnpm governance:check`、Loop 36/36、安全测试 19/19 与中央工程记忆 8/8 通过；线上保护读回无其他字段漂移，PR #65 显示 `viewerCanMergeAsAdmin=true`。
- 边界：工程所有者一次性授权本治理事实经受检 fast-forward 直接合入；未自动审批、未自动合并、未合并 #65、未部署，Agent、GitHub Actions、LoopAny 与休眠 L3B Engine 均不得继承管理员旁路。
- 回滚：恢复线上及仓库合同的 `enforce_admins=true` 并回退本治理提交；不 force-push、不改写共享历史。
