# TASK-RELEASE-003：不可变 Release 目标机验证与恢复演练
- 状态：Verification / G3
- 关联需求：`REQ-DEPLOY-002`、`REQ-LOOP-002`
## 目标
以受保护 `main@bc1ed2d` 重建并发布不可变 Release，使用固定样例关闭 AI/地图竞态风险，并实证失败发布自动恢复，不调用付费服务。
## 验收标准
- [x] Release 身份、镜像摘要、外部入口与重启校验一致；目标机固定 Maven 镜像运行 117/117 用例通过。
- [x] 健康演练 Release 注入退出码 97 后，`current` 未漂移且原 Server/Web 镜像与健康端点自动恢复。
## 回滚
保留失败 Release 与审计摘要；仅通过既有不可变 Release 回滚，不改写清单、Secret 或生产数据。
