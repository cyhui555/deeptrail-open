# BUG-20260718-003 生产 E2E 缺陷修复 ExecPlan
- 状态：G3
- Work Item：[BUG-20260718-003](../issues/bug-20260718-003-production-e2e-remediation.md)

## 成功定义
五项根因均有确定性回归；隔离提交汇入同一集成分支并形成 Draft PR；LoopAny 记录 Outcome，人工仍是唯一 Review/Merge 与生产发布决策者。

## 实施阶段
1. G0：绑定生产 E2E 报告中的 30 个用例、6 个失败断言和五个根因，建立 LoopAny mission 与任务。
2. G1：三路 worktree 并行修复后端契约、空白行程和轨迹 hydration；集成分支修复地图/PDF 发布合同。
3. G2：逐个 cherry-pick 隔离提交，解决交叉文件冲突，运行文档、Server、Web、构建和 Playwright 门禁。
4. G3：推送短期分支并创建 Draft PR；合并、密钥配置、生产部署与部署后全量 E2E 均等待人工决定。

## 验证
`pnpm docs:check`、`pnpm work-items:check`、定向测试、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm verify:server`、`pnpm test:e2e:server`、`pnpm test:e2e:smoke`、`pnpm build`；部署脚本静态测试必须证明空值/重复值失败关闭。

## 恢复
集成前丢弃对应隔离提交；集成后回退 Draft PR。未合入前不部署，合入后仍使用不可变 release、健康失败自动恢复和人工回滚流程。
