# 当前项目状态

- 最后核对：2026-07-20
- 当前阶段：`TASK-APP-001` G2，代码已合入，等待受控部署与真机/真实配额复验
- 公开事实源：`main@714a633`，本地 `main` 与 `origin/main` 一致
- 活动工作项：`TASK-APP-001`；`BUG-20260720-001` 是其子项，`TASK-RELEASE-004` 仅为运维跟进

## 当前事实

- v0.2.0 仍是已部署基线；完整生产放行仍缺 TLS、凭据轮换、独立介质 Restore 和正式回滚演练。
- PR #65 已交付 `com.deeptrail.app.debug` 测试 APK；PR #67 已交付窄屏行程布局与地理编码 5 QPS 级联修复，均未自动部署。
- `BUG-20260720-001` 让每次真实 Provider 请求重新领取令牌，限流退避但不触发 60 秒健康熔断；真实连接故障熔断保持不变。
- React Doctor Daily 与 Housekeeper Daily 已暂停归档；生产错误晨检、每周文档检查和市场雷达继续按各自受控边界运行。
- 工作区唯一活动仓库为 `travel-open`；旧 `travel` 默认只读，用户任务与定时自动化使用分离的 worktree 根。

## 当前约束

- 同一时间只推进一个产品主任务；iOS、推送、支付、原生地图、完整离线、商店发布和后台扩展均未准入。
- 会修改代码或创建 PR 的维护自动化不得与产品 WIP 并行；连续三轮无可执行结果、写路径长期阻塞或与活动工作重叠时暂停。
- 普通代码经受检 PR 合入；同账号管理员人工旁路不授权 Agent、Workflow 或 Loop 自动审批、合并或部署。
- 正式 Android 仍需要受信任 HTTPS Origin、最终 application ID 与签名证书归属；不得把 HTTP debug 壳描述为正式发布。

## 最近验证

- PR #67 精确 Head `107c3a4` 的五项 Required Checks 全部成功并 squash 合入 `main@714a633`；本地验证为 Server 681/681、地理编码 62/62、浏览器 15/15，以及 lint、typecheck、build、文档和 Work Item 门禁通过。
- 两条归档循环已从 Loopany 读回 `enabled=false`、`nextFire=null`，历史任务文件和运行记录保留。
- 中央工程记忆校验存在预先已有的 `last_memory_digest` 不匹配，当前标记 `shared-memory-unavailable`；本地事实源继续有效，中央同步暂停。

## 下一项唯一动作

将 `main@714a633` 发布到受控验收环境，用脱敏规划任务复验 POI 坐标补全率，并在 360px/390px 真机复验折叠行程与主操作区；不同时开启新功能。
