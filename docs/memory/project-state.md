# 当前项目状态

- 最后核对：2026-07-21
- 当前阶段：`TASK-PRODUCT-002` G3 Ready for Review；行程日期视图与最近任务筛选已完成实现和本地门禁，Android 基础切片保持 Closed
- 公开事实源：受保护 `origin/main`；任何新开发或发布必须在执行时重新解析并核对完整 SHA
- 活动工作项：`TASK-PRODUCT-002`；`TASK-RELEASE-004` 仅为运维跟进，不占用产品 WIP

## 当前事实

- 目标环境当前 release 为 `v0.2.0-20260720-120655-cd180c35b2ed`；工程所有者已验收 Android 功能，并明确关闭 `BUG-20260720-001/002`。
- `TASK-APP-001` 已交付测试 APK、PWA/站点关联基础、360px/390px 窄屏布局、地理编码 5 QPS 级联修复和按天地图视口修复；详细记录已压缩到 `docs/archive`。
- `BUG-20260720-003` 已由 PR #75 合入并保持 Closed；其小红书链接导入修复包含在本次已验收目标版本中，不自动重算历史错误任务。
- `TASK-PRODUCT-002` 已进入 Review Queue，并通过当前独立短期分支提交受检 Draft PR；是否合入仍由工程所有者决定。
- `REQ-PRODUCT-002` 已在独立 worktree 与短期分支完成，基线为 `origin/main@95bb659`；范围只包含行程管理和最近任务筛选，没有数据库迁移或外部系统写入。
- React Doctor Daily 与 Housekeeper Daily 已暂停归档；生产错误晨检、每周文档检查和市场雷达继续按各自受控边界运行。
- 工作区唯一活动仓库为 `travel-open`；旧 `travel` 默认只读，用户任务与定时自动化使用分离的 worktree 根。

## 当前约束

- 下一轮仍只允许一个产品主任务；iOS、推送、支付、原生地图、完整离线、商店发布和后台扩展均未自动准入。
- 普通代码经受检 PR 合入；同账号管理员人工旁路不授权 Agent、Workflow 或 Loop 自动审批、合并或部署。
- 正式 Android 仍需要受信任 HTTPS Origin、最终 application ID 与签名证书归属；不得把 HTTP debug 壳描述为正式发布。
- L2 Cohort 的 10 个历史 Work Item 路径由运行时 Manifest 绑定，归档整理不得移动或压缩这些文件。

## 最近验证

- `TASK-PRODUCT-002` 仓库 lint、typecheck、test、server verify、eval、build 全部通过；服务端 684/684、浏览器 smoke 16/16、定向 Playwright 3/3，桌面与 390px/360px 验收通过。
- 工程所有者于 2026-07-21 确认 Android 功能验收通过，并要求对应 Bug 全部关闭、准备下一轮开发。
- 当前主干 Android Test APK run `29809421959` 成功；`com.deeptrail.app.debug`、debug 签名校验和 Artifact 自带 SHA-256 校验均通过，APK SHA-256 为 `ba9751a99dfbe212ce19c695bcde456cc9e6ee8b707c9371a48141a992e3bc2a`。
- 合入前证据保持有效：Server `verify` 684/684、Server E2E 39/39、前端 smoke 16/16、移动端与地图定向回归、生产构建、Eval、lint、typecheck、test 与治理门禁通过。
- 中央工程记忆仍存在多项目及 Deeptrail 重叠的未提交改动，本轮继续按受保护现场处理，不写入中央。

## 下一项唯一动作

等待 `TASK-PRODUCT-002` Draft PR 的远程 CI 与工程所有者验收；本轮不合并、不部署。
