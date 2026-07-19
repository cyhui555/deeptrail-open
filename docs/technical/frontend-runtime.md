# 前端运行规范

## 位置与边界

- Next.js 工程：`apps/web/`
- 页面：`apps/web/src/app/`
- 组件：`apps/web/src/components/`
- API 客户端：`apps/web/src/lib/api.ts`
- 跨应用 E2E：`tests/e2e/`

Web 不直接访问数据库或模型 Provider，所有业务数据通过 Server API 获取。

## 启动与验证

在仓库根目录执行：

```powershell
pnpm dev:web
pnpm --filter @deeptrail/web lint
pnpm --filter @deeptrail/web typecheck
pnpm --filter @deeptrail/web build
pnpm test:e2e:smoke
```

默认页面为 `http://localhost:3000`。浏览器固定请求同源 `/api`；Next.js 服务端通过 `BACKEND_INTERNAL_URL` 转发，未设置时后端为 `http://localhost:8080`。

## 交互与状态规则

- 页面、表单、按钮、空状态和错误默认使用简体中文。
- 加载、空数据、错误和成功是互斥状态；API 超时后必须结束骨架并提供重试。
- 首屏优先显示本地外壳与稳定数据，非关键 AI/地图状态静默异步加载。
- 跨页面表单草稿按明确生命周期保留；提交成功或用户主动清空时删除。
- 同一业务实体复用同一展示组件，通过 props 处理变体，不建立样式和逻辑分叉。
- 可点击卡片遵守 HTML 语义，禁止在 `<button>` 内嵌套流式容器。

## React 与地图 SDK

- 高德 SDK 通过 `useAMapLoader` 单例加载；Key 只从公开构建变量读取，安全密钥在 SDK 脚本前初始化。
- 传给命令式 SDK 的回调与集合保持稳定引用，实例生命周期与业务数据更新分离。
- 初始视野可先使用轨迹坐标，晚到的有效 GPS 或更高质量坐标必须能够校正视野。
- effect 有意忽略依赖时，在 lint 抑制上方用简体中文说明生命周期原因。
- 增删、移动共享模块或出现 chunk/500 异常时，停止旧 dev server、清理 `apps/web/.next` 后重启并实际访问动态路由。

## 样式与验收

- 视觉令牌与语义类集中在 `apps/web/src/app/globals.css`，组件不重复硬编码卡片、按钮与状态样式。
- 主要交互使用矿物蓝语义令牌；背景摄影只作为氛围层，内容对比度优先。
- 页面改动至少检查桌面与 390px/360px 视口、键盘焦点、无横向溢出和真实首屏状态。
- Playwright 优先使用 `getByRole`、`getByLabel`、`getByPlaceholder`，避免模糊 CSS locator。

完整视觉规则见 [样式规范](style-guide.md)，可复用根因见 [工程经验](../memory/lessons.md)。
