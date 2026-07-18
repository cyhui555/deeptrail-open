# BUG-20260718-003 生产 E2E 五项缺陷修复
- 状态：Ready for Review / G3
- 关联 Requirement：`REQ-PERF-002`、`REQ-UX-003`、`REQ-QUALITY-003`、`REQ-DEPLOY-002`
- ExecPlan：[生产 E2E 缺陷修复计划](../plans/bug-20260718-003-production-e2e-remediation.md)

## 目标
修复生产实测确认的五个独立根因，由 LoopAny 跟踪、隔离 Agent 并行开发、单一 Draft PR 交付，人工 Review/Merge 与生产部署边界不变。

## 验收标准
| ID | 根因 | 可验证结果 |
| --- | --- | --- |
| `BUG-20260718-003` | 分页 DTO 漂移 | 返回稳定的 `page/totalPages` 合同 |
| `BUG-20260718-004` | Forbidden 使用 HTTP 200 | 越权返回 403 且不泄漏数据 |
| `BUG-20260718-005` | 空白行程无首点入口 | 可新增首个自定义打卡点并持久化 |
| `BUG-20260718-006` | 本地时间造成 hydration 差异 | 历史轨迹页无 hydration 错误 |
| `BUG-20260718-007` | 地图构建/运行密钥未注入 | 缺配置失败关闭，静态地图与 PDF 回归通过 |

## 回滚
回退本 Draft PR 即可；不迁移数据库、不写生产 Secret。真实 Key 仅由管理员写入 root-only 环境文件，未获人工合并与部署批准前不改变当前 release。
