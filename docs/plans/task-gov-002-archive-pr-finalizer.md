# TASK-GOV-002 归档自动收口 ExecPlan
- 状态：G2；[Work Item](../issues/task-gov-002-archive-pr-finalizer.md)；Requirement：`REQ-GOV-001`
## 计划
G0 核对分支保护、Actions Review 权限和 #55 差异；G1 以受信任 `workflow_run`、最小写权限、精确 Head/最新 main/五项 Check Run 和文档白名单实现失败关闭审批与 squash merge；G2 执行专项、安全、治理与全量门禁；G3 人工审查治理变更后，用所有者作者归档 PR 真实验证自动闭环，再归档本任务。
## 风险与恢复
禁止 `pull_request_target`、Secret、管理员绕过、机器人自审、分支删除和部署；任何 API、身份、差异、检查或合并竞态异常均停止，删除 Workflow 可完全关闭后续写入口。
