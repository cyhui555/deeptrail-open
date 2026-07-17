# TASK-OPS-001 后台用户管理交付摘要

- 状态：Closed
- Requirement：`REQ-OPS-001`
- 完成日期：2026-07-16

## 交付结果

- 默认环境关闭 `POST /api/auth/register`，Web 移除注册入口并将 `/register` 重定向到登录页；仅 `test` Profile 保留隔离测试账号夹具。
- Flyway V6 增加 `ADMIN/USER`、账号启用状态和创建人字段，以 BCrypt 哈希初始化唯一管理员账号。
- `/api/admin/users` 提供服务端搜索分页、普通用户创建、启停和密码重置；不提供物理删除，不允许普通用户或已停用用户访问。
- 认证响应携带角色，拦截器每次请求校验账号仍存在且已启用，使停用操作立即撤销既有会话。
- Web 新增响应式 `/admin/users`，覆盖加载、错误、空结果和操作反馈；仅管理员展示导航入口，普通用户路由守卫回到首页。

## 验收证据

- `pnpm verify:server`：647/647，通过覆盖率与 Checkstyle。
- `pnpm test:e2e:server`：37/37。
- `pnpm test:e2e:smoke`：10/10，覆盖注册关闭、管理员分配与停用账号、普通用户越权拦截、HttpOnly Cookie 和 360px 布局。
- `pnpm lint`、`pnpm typecheck`、`pnpm build` 与 `pnpm perf:check` 通过；用户管理路由 gzip `98.1 / 140 kB`，11/11 路由预算通过。
- 全量旧 Playwright 套件受 15 分钟外层执行限制未形成最终汇总，未计为通过；新增验收场景由独立 smoke 明确覆盖。

## 关键边界与后续

- 初始管理员密码仅用于本次明确的启动要求，数据库不保存明文；正式部署前应通过后续账号安全能力替换为强密码。
- 本期不提供管理员删除、批量导入、细粒度 RBAC、审计日志或用户行程内容运营。
- 后续按[产品路线图](../plans/future-roadmap.md)先补齐审计与管理员改密，再扩展行程客服和 AI 服务观测。

## 回滚

- 可下线管理入口与 API；V6 新增列和管理员记录保留，避免 SQLite 破坏性降级。
- 账号停用可重新启用；密码重置不可恢复旧哈希，只能再次设置新密码。
