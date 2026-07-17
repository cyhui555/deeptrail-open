# TASK-CI-001：升级并锁定 GitHub Actions Node 24 Runtime
- 状态：Verification
- 关联规则：`RULE-002`
## 目标
消除公开 CI 的 Node 20 Runtime 弃用警告，并把所有远程 Action 固定到已核验的完整 Commit SHA。
## 验收标准
- 静态治理拒绝旧 Major、浮动 Tag 和未知 Action；五项 Required Checks 全绿且不再产生 Node 20 弃用 Annotation，见 [GitHub #18](https://github.com/cyhui555/deeptrail-open/issues/18)。
## 回滚
- 回退本任务 Commit 并保留失败 CI；不得绕过 Required Checks，也不改变业务依赖、部署或付费服务。
