# 当前项目状态
- 最后核对：2026-07-19
- 当前阶段：`TASK-GIT-001` 完成本地 G3；生产 E2E 五项修复已部署验证，L3B Engine 保持休眠
- 当前检查门：公开 `main@06e4058`；PR #53 已人工合入并待批准范围内的不可变部署，Post-merge GC 仍须机器人 Draft PR 与人工 Review/Merge
- 活动工作项：`TASK-GIT-001`、`BUG-20260719-001`、`TASK-LOOP-008`、`TASK-RELEASE-003`、`TASK-OPS-002`

## 当前事实
- PR #50 已发布为 `v0.2.0-20260718-163614-20afc03e084e`；生产 E2E 30/30、容器健康、日志和 SQLite 复验通过。
- PR #53 已合入非破坏性坐标更新、受控并发、POI 搜索兜底与真实完成度；不可变部署和目标探针仍待执行。
- Git 审计确认 `deeptrail-open` 存在 34 条远端 feature 分支、15 条本地分支与 13 个 worktree；当前没有成功后 GC 状态。
- `TASK-GIT-001` 仅新增独立 GC，不改变人工审批、合并和部署边界；dirty worktree、OPEN PR 与发布证据失败关闭。
- 旅迹 M0—M16、后台运营与 v0.2.0 发布历史位于 `docs/archive/`；L3A 已交付，L3B activation 已终止且无合并权限。

## 当前约束
- 禁止直推 `main`；必须经短期分支 PR、有效审批和 Required Checks。仅 `BUG-20260719-001` 在合入后按用户本次明确批准执行部署。
- 默认测试使用确定性替身；真实高德探针只在人工触发的 release 验收执行一次并声明范围，不读取用户数据。
- 完整生产放行仍缺 TLS、凭据轮换、远程制品链、独立介质 Restore 和正式回滚演练。

## 当前验证
- PR #50 与部署后生产 E2E 30/30 已通过；`TASK-GIT-001` 专项 8/8、安全 25/25 与本地全门禁通过。
- PR #53 合入前通过 Server 677/677、后端 E2E 39/39、Playwright 6/6、smoke 12/12 及完整质量门禁。
- 既有 Loop 门禁：36/36 单测、2/2 集成、公开 Cohort 10/10；自动审批、合并、管理员绕过与自动部署保持关闭。

## 下一项唯一动作
创建绑定 GitHub #54 的机器人 Draft PR，等待人工 Review/Merge；合入前不执行 apply。
