# TASK-RELEASE-004：远程不可变制品链

- 状态：In Progress / G2
- 优先级：P0
- 关联 Requirement：`REQ-RELEASE-002`
- ExecPlan：[远程制品链计划](../plans/task-release-004-remote-artifact-chain.md)
- 操作手册：[远程制品链](../operations/remote-artifact-chain.md)

## 目标

从受保护 `main` 的精确 Commit 在 GitHub Actions 干净环境中构建并推送 Server/Web 镜像，以 digest、源码 bundle、校验和与 `release.json` 形成可验证制品包，但不连接目标机、不部署、不回滚。

## 验收标准

- [x] 仅仓库所有者可从 `main` 手动触发，输入必须是当前受保护 `main` 的完整 SHA；Workflow 无自动触发器。
- [x] 只授予 `contents: read` 与 `packages: write`，Action 固定完整 SHA，仅引用两项明确的 Web 构建配置。
- [x] 基础镜像先解析为 digest；`build-images.sh --push` 生成 GHCR digest 引用、BuildKit provenance、SBOM 与严格 `release.json`。
- [x] 证据包包含源码 Git bundle、SHA-256、生产 Compose、release manifest 与包级校验和，且不包含运行时 Secret。
- [x] GitHub `release-artifacts` Environment 已创建并只接受受保护分支；当前 Secret 列表保持为空。
- [x] 安全测试拒绝扩大触发器、权限、Secret 或部署边界；本任务不调用 `deploy.sh`、`remote-release.sh`、`rollback.sh`、SSH 或 `gh release`。
- [ ] Workflow 合入受保护 `main` 后，由所有者配置 `release-artifacts` 环境的两项 Web 构建值并完成一次真实远程运行。

## 回滚

在尚未部署的前提下，回退 Workflow、校验器和文档即可停止后续构建；已推送的 digest 制品保持不可变并保留审计，不删除、不覆盖，也不触碰现有目标环境。
