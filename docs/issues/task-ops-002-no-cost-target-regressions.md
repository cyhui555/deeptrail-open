# TASK-OPS-002：零付费目标机确定性回归
- 状态：Verification
- 关联需求：`REQ-DEPLOY-002`、`REQ-LOOP-002`
## 目标
固化目标机回归脚本：绑定当前 Release、提交和 Maven digest，只读加载源码，在无网络测试容器中验证并发、解析与失败终态。
## 验收标准
- [x] 脚本拒绝源码 SHA 漂移、浮动基础镜像、越界目录和并发执行；CI 执行 Shell 静态测试。
- [x] 空测试仅预热 Maven 运行时；固定回归阶段 `--network none`，不挂载生产 Secret、数据库或日志。
## 回滚
回退脚本与 CI 步骤；不删除已发布 Release、Maven 缓存或既有证据，不以真实 Provider 替代固定样例。
