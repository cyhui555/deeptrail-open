# 当前项目状态
- 最后核对：2026-07-18
- 当前阶段：`BUG-20260718-003` 五项修复与本地全门禁完成，进入 G3；L3B Engine 保持休眠
- 当前检查门：公开 `main@a79f9af`；机器人作者 PR 等待人工 Review/Merge，禁止自动合并与部署
- 活动工作项：`BUG-20260718-003`、`TASK-LOOP-007`、`TASK-RELEASE-003`、`TASK-OPS-002`

## 当前事实
- 生产全量 E2E 共 30 个唯一用例，24 通过、6 个断言失败并归并为分页、HTTP 状态、空白行程、轨迹 hydration、地图/PDF 配置五个根因；脱敏报告位于项目外 `deeptrail-open-loop/ops/production-e2e-results/`。
- LoopAny mission `deeptrail-production-e2e-remediation` 的五个 task 已汇入单一集成分支；Loop 只编排与记录证据，不审批合并或部署。
- 当前生产 Web 容器未获得 AMap 构建与运行配置，静态地图 500 并阻断 PDF；真实 Key 不进入 Git、日志或报告。
- 旅迹 M0—M16、后台运营与 v0.2.0 不可变发布历史位于 `docs/archive/`；L3A 已交付，L3B activation 已终止且无合并权限。

## 当前约束
- 禁止直推 `main`；必须经短期分支 PR、人工所有者审批和 Required Checks，不自动合并或部署。
- 默认测试使用确定性替身；真实高德探针只在人工触发的 release 验收执行一次并声明范围，不读取用户数据。
- 完整生产放行仍缺 TLS、凭据轮换、远程制品链、独立介质 Restore 和正式回滚演练。

## 当前验证
- 本地全门禁通过：治理/安全、673 单测、覆盖率、39 Server E2E、OpenAPI、3 定向浏览器 E2E、12 Smoke、生产构建与部署静态合同均全绿。
- 既有 Loop 门禁：36/36 单测、2/2 集成、公开 Cohort 10/10；自动审批、合并、管理员绕过与自动部署保持关闭。

## 下一项唯一动作
人工审核机器人作者 PR；合入后另行批准配置 Key、不可变部署与生产全量 E2E 复验。
