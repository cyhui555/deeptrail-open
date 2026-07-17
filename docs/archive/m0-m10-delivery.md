# M0–M10 交付摘要

本文件替代已关闭 Issue 与 ExecPlan 正文，只保留恢复所需的范围、结果和长期证据。完整事实以代码、Git 历史、Requirement、测试和契约为准。

| 工作项 | 结果 | 长期证据 |
| --- | --- | --- |
| TASK-M0-001 | 完成 Travel 有效工作树迁移，建立 pnpm/Turbo monorepo 与质量基线 | `README.md`、`docs/architecture/project-structure.md`、根脚本与 CI |
| TASK-M1-001 | 完成认证、媒体访问、Flyway、部署与安全治理 | Server 安全测试、`database/migrations/`、`infra/` |
| TASK-M2-001 | 拆分核心服务职责并补齐契约基线 | Server Service/测试、`docs/api/openapi-contract-baseline.json` |
| TASK-M3-001 | 完成“旅轨”品牌与首轮核心界面升级 | Web 组件、全局样式、视觉 E2E |
| TASK-M4-001 | 将默认 AI Provider 切换为 LongCat OpenAI-compatible 接口 | Server 配置、Provider 测试；密钥仅存在本机环境 |
| TASK-M5-001 | 全站重构为暖纸张、编辑式标题与毛玻璃视觉 | `apps/web/src/app/globals.css`、页面组件、视觉验收 |
| TASK-M6-001 | 将交互主色统一为矿物蓝并完成 360/390px 适配 | 响应式样式、移动端 E2E |
| TASK-M7-001 | 增补新疆、川西、雪山和高原公路实景摄影背景 | `apps/web/src/assets/`、`ScenicBackdrop.tsx`、背景 E2E |
| TASK-M8-001 | 优化按钮语义、地图诊断与行程首屏性能 | 地图/行程实现、V3 索引、性能与地图 E2E |
| TASK-M9-001 | PDF 导出统一页面视觉、字号和分页 | `generatePdf.ts`、PDF E2E；8 页样本视觉验收 |
| TASK-M10-001 | 增加安全 AI 就绪状态、草稿保留和错误恢复 | AI 状态接口、首页组件、AI readiness E2E |
| TASK-MEM-001 | 将文档从 45 个/4270 行压缩为 17 个/965 行，加入防膨胀检查，并完成 deepbarin 增量同步 | `docs/README.md`、`docs/process/documentation-governance.md`、`scripts/check-docs.mjs`；中央校验 6/0，通过但因源范围 dirty 保持 `partial/paused` |

## 已关闭 Bug

| Bug | 结论 | 回归证据 |
| --- | --- | --- |
| BUG-20260715-001 | 修复高德安全密钥初始化与地图不可用提示 | `map-live-config.spec.ts`、地图定向回归 |
| BUG-20260715-002 | 测试桩限制在 test Profile，非测试缺少 Provider 时显式不可用 | Provider guard 测试、AI readiness E2E |
| BUG-20260715-003（登录） | 修复 loopback 主机下 CORS/认证 403 | 认证与浏览器回归 |
| BUG-20260715-003（刷新/地图） | 移除刷新阻塞，允许晚到 GPS/轨迹校正初始视野 | `refresh-map-initial-state.spec.ts`、性能 E2E |
| BUG-20260715-004 | 恢复后端进程并让 Web 对 API 不可用提供可诊断错误 | Health、浏览器无 5xx 验收 |

> 2026-07-15 曾出现两个 `BUG-20260715-003`。为保留历史引用不重写旧 ID，本摘要用主题区分；新 Bug ID 必须先在看板中检查唯一性。
