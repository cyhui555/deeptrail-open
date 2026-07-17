# BUG-20260716-003 PWA 配额与认证存储热修摘要

- 状态：Closed
- 完成日期：2026-07-16
- 关联能力：`REQ-PERF-002`

## 现象与根因

- 3000 端口和登录页 HTTP 均正常，但既有浏览器控制台出现 `net::ERR_FAILED` 与 `QuotaExceededError`，页面无法正常加载。
- Service Worker 已获得静态资源网络响应后继续等待 `cache.put()`；当 Cache Storage 配额耗尽时，写入异常使整个 `respondWith` Promise 被拒绝，浏览器因此丢弃已成功的网络响应。
- 生产构建重启前已打开的登录页仍持有旧 Next.js 客户端路由清单；登录 API 成功并写入 Cookie 后，旧客户端执行软跳转可能显示 `Internal error` 且停留在登录页。
- 截图中的账号认证实际已成功，但 AuthContext 随后同步等待 IndexedDB 离线队列清理；浏览器存储损坏或配额异常抛出 `DOMException('Internal error.')` 后，成功登录被前端误判为失败，退出流程也在同一步骤中断。

## 修复

- Worker 升级到 v5，预缓存失败不再阻止安装、激活和旧缓存清理。
- Cache Storage 读取、打开和写入均改为尽力而为；写入失败仍立即返回网络响应。
- 导航离线回退同样容忍 Cache Storage 不可用；PWA 注册或更新失败不再产生未处理 Promise 异常。
- 登录成功后改为经过站内路径校验的完整页面导航，不再依赖旧标签页中的客户端路由清单，并同时拒绝 `//` 开头的站外跳转。
- 离线数据清理失败时关闭当前 IndexedDB 连接并尽力删除离线库；认证上下文使用 `Promise.allSettled`，本地增强存储失败不再改变登录或退出结果。
- 个人资料退出改为完整页面导航；登录页增加“清除当前登录状态”，即使停留在登录页也能调用退出接口并清除 HttpOnly Cookie。
- 新增配额边界回归，使用 Chromium CDP 将测试站点配额限制为 1 KB 后请求真实 Next.js 静态脚本。

## 验收

- Web 生产构建通过，`http://localhost:3000/login` 返回 200，`/sw.js` 提供 v5。
- 配额探针确认 Worker 受控、静态脚本返回 200、页面 `h1` 存在且无 `requestfailed` 或页面脚本错误。
- `m13-quality-boundaries.spec.ts` 定向回归 1/1 通过。
- 管理员真实浏览器登录确认 POST 200、`token` Cookie 写入、完整导航到首页并成功加载认证数据；登录与管理员账号分配 smoke 2/2 通过。
- 强制让 IndexedDB 的 `open` 与 `deleteDatabase` 均抛出 `Internal error.` 后，登录、个人资料退出和登录页清除状态均成功；截图账号真实链路登录 200、最终 Cookie 清除，完整 smoke 11/11 通过。

## 用户侧恢复

- 普通刷新会触发 v5 更新并接管；认证不再依赖浏览器存储清理成功。
- 若需要主动结束残留会话，可直接点击登录页底部“清除当前登录状态”，无需进入个人资料页。
