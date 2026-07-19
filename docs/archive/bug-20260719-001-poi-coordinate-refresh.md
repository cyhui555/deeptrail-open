# BUG-20260719-001 POI 坐标刷新交付摘要

- 状态：Closed / G3；GitHub #51 已完成关闭
- 合并：PR #53，`main@06e4058c57cda03cea384cb0226b090c38f2c9d3`
- 根因：强制重查把 Provider 空结果写成空坐标，9 点串行查询受 30 秒 Web 超时影响，高德缺少 POI 关键词搜索兜底
- 修复：成功才覆盖、失败保留旧值；4 线程有界解析；高德 POI 搜索与跨城 Provider 回退；60 秒刷新超时和真实有效数反馈
- 本地验收：Server 677/677、后端 E2E 39/39、Playwright 6/6、smoke 12/12，lint/typecheck/合同/覆盖率/构建/体积/治理通过
- 远程验收：5 项 Required Checks 与额外完整前端 E2E 全绿，作者外批准有效
- 发布：`v0.2.0-20260719-025020-06e4058c57cd`；SQLite 备份、地图探针、Release 身份、外部健康与两个容器 healthy
- 终验：已认证用户于 2026-07-19 确认生产验收通过
- 回滚：上一 release `v0.2.0-20260718-163614-20afc03e084e` 保留，无 Schema 迁移
