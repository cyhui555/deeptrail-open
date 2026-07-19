# 当前项目状态

- 最后核对：2026-07-20
- 当前阶段：`TASK-APP-001` 真机反馈修复 G2（含 `BUG-20260720-001`）+ `TASK-LOOP-008` G2
- 当前检查门：公开 `main@bfc3068`；当前短期分支 `fix/task-app-001-mobile-geo` 已重放至该主干
- 活动工作项：`TASK-APP-001`（唯一产品任务）、`TASK-LOOP-008`（唯一维护试运行）

## 当前事实

- 旅迹 v0.2.0 已部署并完成目标环境 G3；坐标刷新与两项 AI 任务 Bug 已发布复验，旧私库 GitHub #21/#24 已关闭。
- `TASK-GOV-003` 已由 PR #59 合入 `main@0470f2f`；高权限 Archive PR finalizer 已删除，所有 PR 恢复人工 Review/Merge。
- `TASK-RELEASE-004` 已由 PR #62 合入 `main@88b5092` 并完成主干 CI；首次真实远程制品运行仍等待环境配置，不部署且不再占用产品 WIP。
- Dependabot PR #60/#61 与文档诚实性 PR #63 已依次合入，公开主干推进到 `main@52ac204`。
- 工程所有者明确采用单维护者模型：Agent 负责产出，所有者人工审核；同账号 PR 允许管理员显式旁路，自动化不得继承该权限。
- `TASK-GOV-004` 已完成并合入 `main@b21c373`：线上 `enforce_admins=false` 且 PR #65 `viewerCanMergeAsAdmin=true`，本地治理合同、ADR 与失败关闭边界同步完成。
- 工程所有者要求后续产品迭代采用最小可验证切片，当前只开发 Android；iOS 因复杂度明确后置。
- Android 首期复用现有 H5/PWA、同源认证与现场执行流程，不重写业务前端。
- Android 基础切片已加入稳定 PWA 身份、浏览器条件化安装入口、失败关闭的 Digital Asset Links 与确定性就绪检查。
- PR #65 已合入 `main@f9722a2`，并生成仅用于当前 H5 验收的 WebView debug APK；正式 release、正式签名、商店发布与自动部署仍禁止。
- PR #64 已合入 `main@bfc3068`，不支持的 HTTP 方法现在保持 HTTP 405 / `METHOD_NOT_ALLOWED` 语义。
- 真机截图反馈的折叠卡片、窄屏按钮和规划概要已完成响应式修复；用户澄清第 3 项是规划转行程时的 POI 地理编码批量失败，不是手机 GPS。
- `BUG-20260720-001` 已确认当前高德配置为 5 QPS；I/O 重试未重新领令牌，且一次 QPS 错误会按阈值 1 打开 60 秒 Provider 熔断，放大为同批坐标缺失。
- `BUG-20260720-001` 已修复：每次外部 HTTP 尝试重新领令牌，高德 QPS 错误退避重试且不再触发 60 秒健康熔断；真实连接故障熔断保持不变。
- React Doctor Daily 保持 `0 6 * * *`（`Asia/Shanghai`）启用；复测已以 `nothing-new` 持久化 `healthScore=38`，不改变周期，不自动合并或部署。

## 当前约束

- 普通功能与治理分支禁止直推 `main`，仍经五项 Required Checks 和作者外审批合入；纯文档归档可按所有者授权经受检 fast-forward 直接合入。本次 `TASK-GOV-004` 配置收口另有所有者一次性明确授权，不扩张为后续代码直推例外。
- 同账号 Agent PR 可由唯一所有者核对精确 Head、Checks 与对话后执行管理员合并，但不生成虚假的自审批，也不开放自动审批、自动管理员合并或部署。
- 当前只补齐 PWA 身份、站点与应用关联及就绪检查；不扩展 iOS、推送、支付、原生地图、完整离线或后台能力。
- Digital Asset Links 必须失败关闭；不提交签名密钥、真实用户数据或明文生产 App 快捷配置。
- 正式 TWA 仍要求受信任 HTTPS Origin、application ID 与签名证书指纹。
- 完整生产放行仍缺 TLS、凭据轮换、独立介质 Restore 和正式回滚演练，这些均不属于当前任务。
- `release-artifacts` 环境已创建并限制为受保护分支，当前 Secret 为空；尚需所有者配置两项 Web 构建值，不得从目标机复制 Server Secret 或把值写入 Git/日志。

## 当前验证

- Android 单测 9/9、标准关联路径运行时测试 1/1、浏览器 smoke 13/13 与安全测试 19/19 通过。
- 真机反馈定向 Playwright 2/2、地理编码定向测试 62/62、整库测试 681/681、lint、typecheck、生产构建、文档、Work Item 与 diff 检查通过。
- lint、typecheck、生产构建、文档、Work Item、11 条路由体积和 diff 检查通过。
- `Android Test APK` 运行 #29685119973 在 `ac2eaa5` 成功；`apksigner`、`com.deeptrail.app.debug` 应用身份与下载后 SHA-256 均验证通过。
- `TASK-GOV-004`：`pnpm governance:check`、Loop 36/36 与安全测试 19/19 通过；线上 `enforce_admins=false`，PR #65 已由所有者人工管理员合并。
- 新远程制品 Workflow 合同测试已覆盖手动触发、最小权限、Secret 白名单与禁止部署边界；PR #62 的五项 Required Checks 成功。
- 本机不具备 Android SDK、adb 或 Gradle；APK 已由远程 Runner 构建并下载，尚未执行真机安装与启动验收。

## 下一项唯一动作

通过受检 PR 将 `fix/task-app-001-mobile-geo` 合入 `main`；部署另行执行，并以脱敏规划任务复验目标账号实际 QPS、POI 坐标补全率和新版真机布局。
