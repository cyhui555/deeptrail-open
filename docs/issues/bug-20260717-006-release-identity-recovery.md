# BUG-20260717-006 Release 身份缺失且失败发布未自动恢复

- 状态：Verification / G3
- 优先级：P0
- 关联需求：`REQ-DEPLOY-002`、`REQ-LOOP-002`
- 发现环境：目标 Linux 主机，不可变 Release `v0.2.0-20260717-143945-8642554dbf77`
- 最近更新：2026-07-17

## 目标

让运行中 Server 公开与清单严格一致的脱敏 Release 身份，并保证新 Release 验收失败时自动恢复原 `current` 服务。

## 根因与范围

- `info.release` 已写入配置，但 Spring Boot 3 默认未启用环境 InfoContributor，`/actuator/info` 实际返回 `{}`，与发布验收合同冲突。
- Compose 使用固定项目名和端口替换旧容器；失败 trap 只停止新容器，没有重新启动上一 Release，导致 `current` 虽未切换但服务中断。
- 修复仅涉及 Release 身份贡献器、失败恢复编排与确定性测试，不调用真实模型或外部收费服务。

## 验收标准

- [x] `/actuator/info` 精确返回 `release.id`、`git-commit` 与 `artifact-digest`，且无 Secret 或用户内容。
- [x] 新 Release 验收失败后自动启动上一 Release，并验证 `/login` 与 `/api/health` 可达。
- [x] 恢复失败保留原始发布失败码和明确告警；首次部署无上一 Release 时安全停止未验收容器。
- [x] Server 单测、部署脚本静态/故障恢复测试及受保护 CI 全部通过。
- [x] 目标机不可变发布验证成功，旧版本在故障注入后可恢复，且不产生第三方费用。

## 验证计划

先以本地单元和 Shell mock 覆盖身份、恢复成功/失败，再在目标机使用隔离数据与本地健康端点验证，最后执行正式发布。

## 回滚

回退应用与部署脚本到上一不可变 Release；目标环境显式启动原 `current`。不得删除身份校验或把失败发布写成成功。
