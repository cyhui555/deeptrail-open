# BUG-20260719-001 POI 坐标强制重查部分成功后丢失

- 状态：Ready for Review / G2
- 关联 Requirement：`REQ-QUALITY-003`、`REQ-DEPLOY-002`
- 跟踪：[GitHub #51](https://github.com/cyhui555/deeptrail-open/issues/51)；[ExecPlan](../plans/bug-20260719-001-poi-coordinate-refresh.md)

## 目标

根因是强制重查逐项等待 Provider，并把空结果写成空坐标；高德仅走结构化地址编码，POI 名称缺少关键词搜索兜底；Web 刷新沿用 30 秒公共超时。修复为受控并发、成功才覆盖、失败保留旧值、POI 搜索兜底和 60 秒刷新超时。生产取证仅确认认证重定向与 API 401，未绕过归属或读取真实 POI。

## 验收标准

9 个已有坐标仅 3 个重查成功时仍保留 9 个有效坐标且只覆盖成功项；地址编码落空时 POI 搜索可返回合法坐标；解析受控并发，签到项写入顺序执行；页面展示真实 `有效数/总数`。本地证据：Server 677/677、后端 E2E 39/39、Playwright 定向 6/6、smoke 12/12，lint/typecheck/合同/覆盖率/构建/体积/文档均通过；待 PR 必需检查、合并、不可变发布与目标探针。

## 回滚

无 Schema 或持久配置变更；回归时切回上一不可变 release。回滚不自动恢复数据，新逻辑只会保留旧坐标或用有效结果覆盖。
