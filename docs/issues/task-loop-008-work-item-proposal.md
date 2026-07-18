# TASK-LOOP-008：从合格 Issue 生成确定性 Work Item 草案

- 状态：Ready for Review / G3
- 优先级：P0
- 关联 Requirement：`REQ-LOOP-006`
- 上游：[TASK-LOOP-007 交付摘要](../archive/task-loop-007-autonomous-intake.md)
- ExecPlan：[Work Item 草案执行计划](../plans/task-loop-008-work-item-proposal-exec-plan.md)

## 目标

把公开仓中通过 Intake 的 `agent-ready` Issue 转换为固定、可审阅且可逐字节复验的 Work Item 草案，消除人工抄写需求合同的步骤，并为后续机器人 Draft PR 激活提供安全输入。

## 范围

- 只接受 `cyhui555/deeptrail-open` 的 `executable` Issue、稳定 TASK/BUG/SPIKE ID 和已登记 Requirement。
- 仅提取目标、验收标准、范围外与回滚，按数据引用渲染并绑定 Issue、正文与草案摘要。
- 检查活动/归档 ID 冲突、标题与章节预算、控制字符和仓库漂移；当前只输出 Proposal，不写文件、Git 或 PR。

## 验收标准

1. 合法输入生成唯一目标路径、Base64 草案、内容 Hash 与确定性合同摘要，并绑定 clean 主干、Registry 与现有 Work Item 集合；输出不出现正文原文。
2. 非 `executable`、缺稳定 ID/已登记 Requirement、重复或归档 ID、超预算和控制字符均失败关闭或返回不可登记判定。
3. 草案固定为 `Proposed / G0`，Issue 内容全部置于引用块，不能改变 Work Item 结构或获得执行语义。
4. 权限继续声明文件、Git、PR、Review、Merge 和 Deploy 写入为 `false`；自动 Draft PR 另行独立激活。
5. Loop、文档、Work Item、治理及适用仓库门禁通过。

## 范围外

- 自动创建/更新 Issue，自动写 Work Item、推送分支、创建或转 Ready PR，自动 Review/Merge/Deploy。
- 读取私有历史仓 `cyhui555/deeptrail` 的新任务，或把历史同号 Issue 当作公开仓候选。

## 回滚

移除 Work Item Proposal 命令和合同测试即可；本阶段没有远端或生产副作用，既有只读 Intake 保持可用。
