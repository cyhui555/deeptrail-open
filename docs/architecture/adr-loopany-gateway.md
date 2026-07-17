# ADR：以薄 Gateway 接入固定版本 LoopAny

- 状态：Accepted for local shadow
- 日期：2026-07-17
- 关联：`REQ-LOOP-001`、`TASK-LOOP-001`

## 背景

旅迹已有完整业务、GitHub CI 与目标环境部署，重新按 LoopAny 重写成本高且会扩大风险。LoopAny 已提供 Artifact CRUD、开放 Kind、引用图、审计、Doctor、Review/Reflect Skill，但不承担跨进程锁、工程路径约束、事务回执、Git Worktree 或远程合并治理。

当前本机全局 `loopany` 包装器还硬编码共享 `LOOPANY_HOME`，直接调用会造成项目串库。上游固定 Commit 尚未识别到许可证，GitHub 私有仓库主干也无保护规则。

## 决策

采用进程级薄 Gateway：

- LoopAny 是 Artifact、Kind、引用、审计和 Doctor 的唯一实现，不在旅迹复制其内部业务逻辑。
- Gateway 直接调用固定 Bun 和固定源码 `src/cli.ts`，为每次调用注入项目隔离的 `LOOPANY_HOME`。
- Gateway 只补单写锁、版本/路径/预算准入、Skill 哈希同步、事务清单、回执与 Shadow Profile。
- 仓库只保存配置、工程 Kind、Gateway 和测试；LoopAny 源码与运行态不提交。
- Skill 同步是运行时依赖固定，不代表将 Skill 安装或加载到项目 Agent。

## 结果

优点：无需重写业务；上游升级面集中；运行证据可审计；随时可停用且不影响生产。代价：需要维护一层兼容校验；上游 CLI 输出变化会显式失败；本地环境必须提供固定源码与 Bun 路径。

## 安全与治理边界

- 本阶段不执行 AI Worker、业务写入、服务器操作或 GitHub 写操作。
- LoopAny 许可证明确前，不 vendor、分发或宣称生产授权。
- 主干保护具备前不启用 L3 自动 PR/Merge；若平台能力受限，须另立带批准人、等价控制和失效时间的 ADR。
- checkpoint Tag 只用于本任务回退；正式发布仍遵守受保护主干和不可变发布身份规则。

## 替代方案

- 重写为 LoopAny 原生工程：改造面过大，拒绝。
- 直接导入 LoopAny 内部 TypeScript：耦合未发布内部 API，拒绝。
- 直接调用全局 `loopany`：会进入共享 Workspace，拒绝。
- 复制 LoopAny 源码进仓库：许可证与升级风险不可接受，拒绝。
