# 当前项目状态

- 最后核对：2026-07-24
- 当前阶段：`TASK-PRODUCT-003` 的独立展示页与全局打卡 3D 首版已完成本地 G3，等待工程所有者验收
- 公开事实源：受保护 `origin/main`；任何新开发或发布必须在执行时重新解析并核对完整 SHA
- 活动工作项：`TASK-PRODUCT-003`；`TASK-RELEASE-004` 仅为运维跟进，不占用产品 WIP

## 当前事实

- 目标环境当前 release 为 `v0.2.0-20260720-120655-cd180c35b2ed`；工程所有者已验收 Android 功能，并明确关闭 `BUG-20260720-001/002`。
- `TASK-APP-001` 已交付测试 APK、PWA/站点关联基础、360px/390px 窄屏布局、地理编码 5 QPS 级联修复和按天地图视口修复；详细记录已压缩到 `docs/archive`。
- `BUG-20260720-003` 已由 PR #75 合入并保持 Closed；其小红书链接导入修复包含在本次已验收目标版本中，不自动重算历史错误任务。
- `TASK-PRODUCT-002` 已由 PR #76 squash merge 到 `main@7cb41af` 并压缩归档；交付行程月历、软删除和最近任务类型/状态组合筛选，没有数据库迁移或外部系统写入。
- `TASK-PRODUCT-003` 已交付独立 `/globe-demo` 原型和现场打卡 2D/3D 渲染器切换；独立页使用示例景点、完整介绍、官方来源和具有明确许可的实景图片，受保护打卡页直接复用真实打卡点、跨天路线、GPS 轨迹、选择状态及既有打卡流程，不改 API 或数据库。正式 Google 3D Tiles 仍需 Key、计费、归因、性能预算与独立 Provider 准入。
- React Doctor Daily 与 Housekeeper Daily 已暂停归档；生产错误晨检、每周文档检查和市场雷达继续按各自受控边界运行。
- 工作区唯一活动仓库为 `travel-open`；旧 `travel` 默认只读，用户任务与定时自动化使用分离的 worktree 根。

## 当前约束

- 下一轮仍只允许一个产品主任务；iOS、推送、支付、原生地图、完整离线、商店发布和后台扩展均未自动准入。
- 普通代码经受检 PR 合入；同账号管理员人工旁路不授权 Agent、Workflow 或 Loop 自动审批、合并或部署。
- 正式 Android 仍需要受信任 HTTPS Origin、最终 application ID 与签名证书归属；不得把 HTTP debug 壳描述为正式发布。
- L2 Cohort 的 10 个历史 Work Item 路径由运行时 Manifest 绑定，归档整理不得移动或压缩这些文件。

## 最近验证

- `TASK-PRODUCT-002` 精确 PR Head `02b3433` 的五项 Required Checks 全部通过；服务端 684/684、浏览器 smoke 19/19，并生成 6 张脱敏视觉证据，桌面与 390px/360px 验收通过。
- 工程所有者于 2026-07-21 确认 Android 功能验收通过，并要求对应 Bug 全部关闭、准备下一轮开发。
- 当前主干 Android Test APK run `29809421959` 成功；`com.deeptrail.app.debug`、debug 签名校验和 Artifact 自带 SHA-256 校验均通过，APK SHA-256 为 `ba9751a99dfbe212ce19c695bcde456cc9e6ee8b707c9371a48141a992e3bc2a`。
- 合入前证据保持有效：Server `verify` 684/684、Server E2E 39/39、前端 smoke 16/16、移动端与地图定向回归、生产构建、Eval、lint、typecheck、test 与治理门禁通过。
- `TASK-PRODUCT-003` 图片卡片增量通过 lint、typecheck、684/684 默认测试、根生产构建、专项 Playwright 6/6、点位悬浮连续复跑 3/3、桌面/移动截图和 Lighthouse 审计；五张卡片图与选中大图在真实浏览器中均以 960px 宽加载，390px/360px 无横向溢出。Lighthouse Accessibility 100、Best Practices 96、SEO 91、Performance 53、LCP 2.3 秒、CLS 0；WebGL 主线程开销保留为正式合入前性能事项。
- `TASK-PRODUCT-003` 全局打卡增量通过根 lint、typecheck、684/684 默认测试和生产构建；打卡地图 7/7、路线与窄屏回归 12/12、生产模式独立 Demo 6/6、打卡 3D 联动 1/1 通过。真实任务的 1440px/390px 截图无溢出、页面错误、控制台错误或失败请求；默认打卡页 Lighthouse Performance 97、Accessibility 100、TBT 0，独立 WebGL 场景 Performance 51、Accessibility 100，3D 性能继续由按需加载和 2D 回退约束。
- 中央工程记忆仍存在多项目及 Deeptrail 重叠的未提交改动，本轮继续按受保护现场处理，不写入中央。

## 下一项唯一动作

由工程所有者查看现场打卡页的全局 3D 地球和 `/globe-demo` 景点图片卡片效果，并决定是否进入正式合入准备；本轮不自动推送、不合并、不部署。
