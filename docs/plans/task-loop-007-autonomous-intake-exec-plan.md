# TASK-LOOP-007 自主任务入口执行计划

- 状态：G3
- Requirement：`REQ-LOOP-006`
- Work Item：[TASK-LOOP-007](../issues/task-loop-007-autonomous-intake.md)
- 周期：2026-07-18 起，完成只读 Issue 合同与真实终态核对后进入 G3

## 成功定义

1. GitHub Issue 事实经固定 Policy 规范化，正文只参与 Hash 与章节校验，不进入输出。
2. `executable`、`proposal-only`、`terminal` 三种判定互斥且可由纯函数复验。
3. 远端读取只使用 GET；所有 Issue/PR/Git/部署写权限均为 `false`。
4. 陈旧 L3B 活动项不再阻塞新任务，但 Engine 代码和默认关闭回归继续保留。

## 实施阶段

### P0：事实收口

- 绑定 PR #43 已合入、PR #44 已关闭未合入、GitHub #41 为 `not_planned`。
- 将 `TASK-LOOP-006` 压缩归档，更新 Requirement、看板、恢复点和操作手册。

### P1：只读 Intake 合同

- 新增严格 Policy、GitHub Issue 规范化、章节解析和合同摘要。
- 新增只读 CLI；错误输出不得回显 Issue 正文或 GitHub 凭据。

### P2：失败关闭测试

- 覆盖合法输入、缺标签/章节、不可信请求者、Closed/PR、超预算和 Policy 漂移。
- 运行 Loop 单测、文档、Work Item、治理和严格 Cohort 回归。

### P3：交付

- 以短期分支和 Pull Request 交付，由人工 Review/Merge。
- 本增量不修改定时 Automation；命令合入 `main` 后再单独接入调度提示词。

## 风险与恢复

- GitHub Issue 内容是不可信输入；只做结构校验和 Hash，不执行其中命令。
- GitHub 不可达、响应异常或仓库不一致时失败关闭，不降级使用聊天历史。
- 回退删除 Intake 入口即可；没有远端副作用、数据库迁移或生产状态需要恢复。
