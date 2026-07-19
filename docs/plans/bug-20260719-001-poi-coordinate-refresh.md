# BUG-20260719-001 POI 坐标刷新修复 ExecPlan

- 状态：G2；[Work Item](../issues/bug-20260719-001-poi-coordinate-refresh.md)；[GitHub #51](https://github.com/cyhui555/deeptrail-open/issues/51)

## 计划

G0 已完成认证边界、超时、回填逻辑与官方 Provider 契约审计并建立 Issue。G1 已实现非破坏性更新、受控并发、POI 搜索兜底和真实完成度。G2 已通过 Server 677/677、后端 E2E 39/39、Playwright 6/6、smoke 12/12 及 lint/typecheck/合同/覆盖率/构建/体积/文档门禁。G3 推送 PR，在 Required Checks 与独立审批满足后合并，再按用户本次批准执行不可变部署和目标探针。
决策：Provider QPS 仍受全局令牌桶约束；POI 区域仅作权重，跨城结果继续校验；仅顺序写入签到项。基线 `main@20afc03`、release `v0.2.0-20260718-163614-20afc03e084e`，无迁移，失败切回上一 release。
