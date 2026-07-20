# BUG-20260719-002 不支持的 HTTP 方法被映射为内部错误（已交付）

- 状态：Closed / G3
- 优先级：P2
- 关联需求：`REQ-MAINTAINABILITY-001`
- 发现环境：生产错误晨检窗口 `[2026-07-18 06:00, 2026-07-19 06:00)`（Asia/Shanghai）
- 最近更新：2026-07-20

## 目标

将 Spring MVC 的 `HttpRequestMethodNotSupportedException` 映射为 HTTP 405 和稳定的统一错误码，避免预期的协议拒绝进入通用内部错误路径并写入 ERROR 堆栈。

## 范围

### 范围内

- `GlobalExceptionHandler` 的 HTTP 方法不支持异常映射。
- 统一错误码与 MockMvc 回归测试。
- 与该修复直接相关的工作项、看板和验证记录。

### 范围外

- 不根据缺失的请求路径猜测或修改具体 Controller 路由。
- 不调整其他业务异常继续使用 HTTP 200 的既有兼容契约。
- 不修改客户端、不部署，也不处理同一窗口中证据不足的 Prompt 资源读取事件。

## 生产证据摘要

- 持久化 ERROR 源在窗口内记录 4 次同签名事件：`HttpRequestMethodNotSupportedException + GlobalExceptionHandler + method-not-supported + endpoint unknown`。
- 事件均由 `GlobalExceptionHandler` 记录；请求路径未进入可用日志，因此不保留或猜测端点。
- 当前生产 revision 晚于事件窗口，无法证明事件当时的精确 release；但当前生产 revision 与 `origin/main` 的同一处理器仍缺少专用映射，异常会落入 `@ExceptionHandler(Exception.class)`。
- 原始日志、请求信息、主机值和用户数据未进入仓库。

## 根因判断

`GlobalExceptionHandler` 没有处理 `HttpRequestMethodNotSupportedException`。Spring MVC 的预期 405 协议拒绝因此被通用异常处理器捕获，写入 ERROR 堆栈，并以未指定 HTTP 状态的 `ApiResponse` 返回，违反 API 文档中“4xx 表示请求不满足”的约定。

## 验收标准

- [x] 对仅支持 POST 的已知端点发起 GET 时返回 HTTP 405。
- [x] 响应保持统一 `ApiResponse` 结构，`success=false` 且错误码为 `METHOD_NOT_ALLOWED`。
- [x] 该异常不再进入通用 `INTERNAL_ERROR` 路径。
- [x] 定向测试先证明修复前失败、修复后通过。
- [x] `pnpm docs:check`、Server 定向测试与 `pnpm verify:server` 通过。

## 验证计划

- 修复前/后定向回归：`pnpm --filter @deeptrail/server exec mvn -B '-Dtest=GlobalExceptionHandlerTest' test`。
- 文档门禁：`pnpm docs:check`。
- 后端完整门禁：`pnpm verify:server`。
- 密钥与个人信息检查只覆盖本分支差异；不调用真实 AI、地图或其他付费服务。

## 实施说明

该修复只涉及一个异常处理器、一个错误码和一条定向回归，范围简单且不跨工作区，因此不单独建立 ExecPlan。

## 当前验证

- 修复前定向回归：10 条中新增用例 1 条失败，证实期望 405、实际 200。
- 修复后定向回归：10/10 通过。
- `pnpm docs:check`：67 个 Markdown 通过。
- `pnpm work-items:check`：3 个活动项与 10 个历史证据通过。
- `pnpm verify:server`：678/678 通过，Checkstyle 0 违规，JaCoCo 门槛通过并完成可执行 JAR 构建。
- PR #64 在精确 Head `d589be3` 上通过五项必需检查并 squash 合入 `main@bfc3068`；合并后主干 CI run #29692540813 成功。
- 未运行 Web typecheck、浏览器 E2E、AI Eval 或真实外部 Provider 测试；本修复不修改 Web、AI、数据库或外部集成。

## 回退

若修复引入协议兼容问题，回退本修复 Commit；不移动正式 Tag、不改写共享历史，也不触及数据库。
