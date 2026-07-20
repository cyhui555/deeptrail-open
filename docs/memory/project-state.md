# 当前项目状态

- 最后核对：2026-07-20
- 当前阶段：`BUG-20260720-003` G2，Draft PR #75 等待远程 CI 与脱敏截图证据；`TASK-APP-001` 仍只待受控部署复验
- 公开事实源：`origin/main@ae0700a`；修复分支 `fix/bug-20260720-003-xhs-ingestion` 基于该提交
- 活动工作项：`BUG-20260720-003` 为 P1 生产事故例外；`BUG-20260720-001/002` 仍归属 `TASK-APP-001`，`TASK-RELEASE-004` 仅为运维跟进

## 当前事实

- v0.2.0 仍是已部署基线；完整生产放行仍缺 TLS、凭据轮换、独立介质 Restore 和正式回滚演练。
- PR #65 已交付 `com.deeptrail.app.debug` 测试 APK；PR #67 已交付窄屏行程布局与地理编码 5 QPS 级联修复，均未自动部署。
- `BUG-20260720-001` 让每次真实 Provider 请求重新领取令牌，限流退避但不触发 60 秒健康熔断；真实连接故障熔断保持不变。
- `BUG-20260720-003` 已修复裸小红书短链误作正文和含 JavaScript `undefined` 的当前页面状态解析失败；未部署、未重算历史任务。
- React Doctor Daily 与 Housekeeper Daily 已暂停归档；生产错误晨检、每周文档检查和市场雷达继续按各自受控边界运行。
- 工作区唯一活动仓库为 `travel-open`；旧 `travel` 默认只读，用户任务与定时自动化使用分离的 worktree 根。

## 当前约束

- 同一时间只推进一个产品主任务；iOS、推送、支付、原生地图、完整离线、商店发布和后台扩展均未准入。
- 会修改代码或创建 PR 的维护自动化不得与产品 WIP 并行；连续三轮无可执行结果、写路径长期阻塞或与活动工作重叠时暂停。
- 普通代码经受检 PR 合入；同账号管理员人工旁路不授权 Agent、Workflow 或 Loop 自动审批、合并或部署。
- 正式 Android 仍需要受信任 HTTPS Origin、最终 application ID 与签名证书归属；不得把 HTTP debug 壳描述为正式发布。

## 最近验证

- `BUG-20260720-002` 修复前失败证据已确认；修复后地图路线、标记生命周期与刷新初态 15/15，Server 681/681，以及 lint、typecheck、build、文档和 Work Item 门禁通过；交付与远程检查以 PR #74 为事实源，未调用真实高德服务。
- `BUG-20260720-003`：Server 684/684、本地等价 PR smoke 16/16、脱敏截图 2/2、原短链只读抓取 1/1、安全合同 22/22，以及 lint、typecheck、build、Eval、文档和 Work Item 门禁通过；未调用 AI。
- PR #67 精确 Head `107c3a4` 的五项 Required Checks 全部成功并 squash 合入 `main@714a633`；本地验证为 Server 681/681、地理编码 62/62、浏览器 15/15，以及 lint、typecheck、build、文档和 Work Item 门禁通过。
- 两条归档循环已从 Loopany 读回 `enabled=false`、`nextFire=null`，历史任务文件和运行记录保留。
- 中央工程记忆校验 8/8 通过；其工作树存在多项目及 Deeptrail 记忆重叠的未提交改动，本轮按受保护现场处理，不写入中央，本地事实源继续有效。

## 下一项唯一动作

等待 PR #75 最新 Head 的 Required Checks、脱敏截图 Artifact 与 Job Summary；合入后再受控部署并验证新小红书任务，不自动重算历史错误任务。
