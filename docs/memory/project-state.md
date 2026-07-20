# 当前项目状态

- 最后核对：2026-07-20
- 当前阶段：`TASK-APP-001` G2；PR #65/#67/#74 与维护修复 PR #75 已合入，等待受控部署和目标环境/真机复验
- 公开事实源：受保护 `origin/main`；最后核对的产品基线为 `1dcaa19`，任何发布必须在执行时重新解析并核对完整 SHA
- 活动工作项：`TASK-APP-001` 及子项 `BUG-20260720-001/002`；`TASK-RELEASE-004` 仅为运维跟进

## 当前事实

- v0.2.0 仍是已部署基线；完整生产放行仍缺 TLS、凭据轮换、独立介质 Restore 和正式回滚演练。
- PR #65/#67 已交付测试 APK、窄屏布局与地理编码 5 QPS 修复；PR #74 已交付按天地图视口修复，均未自动部署。
- `BUG-20260720-003` 已由 PR #75 受检合入：裸小红书链接只进入白名单抓取器，页面状态中的 JavaScript `undefined` 可安全解析；未部署、未重算历史任务。
- `BUG-20260720-003` 的详细 Issue/ExecPlan、2026-07-11 密钥轮换记录和旧 ExecPlan 独立说明已压缩到 `docs/archive`。
- React Doctor Daily 与 Housekeeper Daily 已暂停归档；生产错误晨检、每周文档检查和市场雷达继续按各自受控边界运行。
- 工作区唯一活动仓库为 `travel-open`；旧 `travel` 默认只读，用户任务与定时自动化使用分离的 worktree 根。

## 当前约束

- 同一时间只推进一个产品主任务；iOS、推送、支付、原生地图、完整离线、商店发布和后台扩展均未准入。
- 普通代码经受检 PR 合入；同账号管理员人工旁路不授权 Agent、Workflow 或 Loop 自动审批、合并或部署。
- 正式 Android 仍需要受信任 HTTPS Origin、最终 application ID 与签名证书归属；不得把 HTTP debug 壳描述为正式发布。
- L2 Cohort 的 10 个历史 Work Item 路径由运行时 Manifest 绑定，归档整理不得移动或压缩这些文件。

## 最近验证

- `TASK-DOCS-004`：Server `verify` 684/684、覆盖率与 Checkstyle 通过；Server E2E 39/39、前端 smoke 16/16、强制 Web/Server 生产构建、Eval、lint、typecheck、test 与治理门禁通过。
- 默认 smoke 首次因本机缺少 Playwright Chromium revision 未进入断言；同一仓库测试编排使用本机 Chrome 后 16/16 通过，临时配置已删除，未调用真实外部服务。
- PR #75 最终 Head `c3e268c` 的五项 Required Checks 成功并合入产品基线 `1dcaa19`；PR #74 合入产品基线 `ae0700a`。
- 中央工程记忆仍存在多项目及 Deeptrail 重叠的未提交改动，本轮继续按受保护现场处理，不写入中央。

## 下一项唯一动作

从执行时核对的受保护 `main` 构建并受控部署，再用脱敏规划任务与 360px/390px 真机复验坐标补全、小红书链接导入、按天地图视口和窄屏布局；不自动重算历史错误任务。
