# TASK-RELEASE-004 远程制品链 ExecPlan

- 状态：G3
- Work Item：[TASK-RELEASE-004](../issues/task-release-004-remote-artifact-chain.md)
- Requirement：`REQ-RELEASE-002`

## 目标与完成边界

把本地/目标机构建前移到 GitHub Actions 干净构建机，输出可由 digest 与 SHA-256 独立核对的源码和容器制品。当前阶段只制作和验证制品链，不部署、不操作生产 Secret、不执行 Restore、TLS、凭据轮换或回滚演练。

## 里程碑

1. G0：核对现有 `build-images.sh`、Compose、发布清单、安全治理和 GitHub 配置，冻结最小权限与证据格式。
2. G1：新增仅手动触发的 `release-artifacts` Workflow，锁定受保护 `main`、基础镜像 digest、GHCR 推送与证据包。
3. G2：新增安全合同测试和操作手册，清账 Requirement、看板、WIP 与项目恢复点；运行本地治理和 Shell 静态门禁。
4. G3：由机器人作者创建 Draft PR，经五项 Required Checks 与作者外 Review 合入；配置环境值后完成一次真实远程运行并核验 digest、SBOM/provenance 和证据包。

## 关键约束与决策

- Workflow 只接受当前受保护 `main` 的完整 SHA，根权限为空，Job 仅有 `contents: read` 与 `packages: write`。
- `release-artifacts` 环境只需要两项会进入浏览器产物的 Web 构建配置；不复制目标机文件，不读取 Server Secret。
- 构建使用既有 `build-images.sh --push` 合同，不建立第二套镜像语义。
- 发布证据上传为 GitHub Actions Artifact；GHCR 镜像以 digest 使用，不发布 GitHub Release，也不连接目标主机。
- WIP 限制为本制品主任务与一个 React Doctor 维护试运行；依赖 PR 只进入审查队列。

## 发现与恢复

- GitHub `release-artifacts` Environment 已建立并限制为受保护分支，Secret 列表为空；真实 Web 制品运行必须等 Workflow 合入后由所有者配置两项值，缺失时 Workflow 失败关闭。
- 本地已验证 `refs/remotes/origin/main` 可生成完整 Git bundle，现有构建脚本支持 `--push`、固定基础镜像与 release manifest。
- 代码回退只需回退本任务提交；外部环境若已创建但尚无 Secret，可保留为空或由所有者删除，不影响现有 CI 和生产。

## 验证与下一动作

- 本地：Workflow 合同测试、`security:test`、`governance:check`、部署 Shell 静态测试与 YAML 解析。
- 远程：PR #62 五项 Required Checks 成功并经作者外 Review 合入 `main@88b5092`；`release-artifacts` Environment Secret 仍为空，Workflow 尚无运行记录。
- 下一项唯一动作：由所有者配置两项 Web 构建值，再对当前受保护 `main` 手工执行一次制品运行并核验，不部署。
