# 工程记忆入口

读取顺序：

1. [当前项目状态](project-state.md)：只看当前阶段、阻塞、最后验证和下一动作。
2. [工程经验](lessons.md)：仅在任务命中相同风险时读取相关条目。
3. 当前 Work Item、代码、测试和正式文档：用于恢复完整事实。
4. deepbarin 的 `shared/rules.md` 与 `projects/deeptrail/`：用于共享基线和跨会话恢复摘要。

更新规则：状态变化才更新 `project-state.md`；同类问题重复出现、影响高或跨任务可复用时才更新 `lessons.md`。聊天、日志、完整验收报告和历史任务正文不进入长期记忆。
