# TASK-LOOP-006：L3B 人工批准后的受控合并闭环

- 状态：In Progress / G0
- 优先级：P0
- GitHub：[#41](https://github.com/cyhui555/deeptrail-open/issues/41)
- 关联 Requirement：`REQ-LOOP-004`
- 上游：[L3A 交付摘要](../archive/task-loop-004-l3a-controlled-execution.md)
- ADR：[L3B 受控合并](../architecture/adr-loop-l3b-controlled-merge.md)
- ExecPlan：[L3B 执行计划](../plans/task-loop-006-l3b-exec-plan.md)

## 目标

在 L3A Draft PR 已验证的基础上，仅当精确 Head 的 Required Checks 全绿、机器人作者之外的人工所有者对同一 Head 有效批准，且保护规则复核仍通过时，允许 Loop 以普通 squash 路径执行一次受控合并。

## 范围

- Policy 默认关闭；固定仓库、PR、Base、Head、ChangePlan、L3A Receipt、Cohort、检查与 Review。
- 合并前后分别复核远端事实，以 Gateway Transaction 与 Receipt 记录结果并支持幂等 Postcheck。
- 禁止自动审批、管理员绕过、force-push、保护降级、自动部署、现场改码与失败现场清理。

## 验收

- [x] GitHub #41、`REQ-LOOP-004`、ADR 与 ExecPlan 建立并明确范围外。
- [ ] 默认关闭的 L3B Policy、MergePlan、远端事实校验与事务恢复实现完成。
- [ ] Draft、审批缺失/过期/驳回、Head/Base 漂移、检查失败、保护变化和并发合并全部失败关闭。
- [ ] Engine PR 经机器人作者、必需检查和人工批准后受保护合入。
- [ ] 独立 activation PR 精确绑定 Engine 证据并再次人工批准。
- [ ] 免费、无业务数据的全新文档试点完成真实受控 squash merge；`autoApprove=false`、`autoDeploy=false`。

## 回滚

关闭 L3B activation 即停止新合并；已经存在的 PR、分支、事务和 Receipt 保留审计。回退不得改写已合入历史、移动 Tag 或触发部署。
