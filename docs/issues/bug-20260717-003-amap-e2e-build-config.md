# BUG-20260717-003 AMap E2E 测试构建缺少公开配置占位值

- 状态：Verification
- 优先级：P1
- 关联需求：`REQ-RUNTIME-001`、`REQ-QUALITY-003`
- 发现环境：公开主仓 Full E2E workflow `29577848547`
- 最近更新：2026-07-17

## 目标

修复 Production E2E 构建只注入 `NEXT_PUBLIC_AMAP_SECURITY_CODE`、未注入 `NEXT_PUBLIC_AMAP_KEY`，导致页面级确定性 AMap Mock 尚未生效前 Loader 即失败关闭的问题。

## 根因与范围

- `useAMapLoader` 在构建期固化两个公开配置字段，并在任一字段缺失时返回 `missing-config`。
- `scripts/run-e2e.mjs` 只提供安全码，18 个地图相关用例因此共同失败；本地补充无外部权限的占位 Key 后，代表性地图回归 11/11 通过。
- 修复只补全测试构建合同；不写入真实 Key、不访问高德 CDN，也不改变生产配置读取或业务降级逻辑。

## 验收标准

- [x] Production E2E 构建同时包含确定性的测试 Key 与安全码占位值。
- [x] AMap 页面仍由 `AMAP_MOCK_JS` 隔离外部 SDK，测试不产生真实地图调用或费用。
- [x] 地图标记与刷新初态的代表性 Playwright 用例通过。
- [x] Web lint、typecheck、build 与 Smoke 保持通过。

## 验证计划

- 地图与刷新代表性回归 11/11，完整 Production Playwright 126 通过、3 项有原因跳过、0 失败。
- Web lint、typecheck、Production build、远端 Smoke 与适用治理检查通过。

## 回滚

回退测试运行器中的占位配置并保留 Full E2E 失败证据；不得以真实 Key、跳过地图用例或放宽 Loader 生产检查替代本修复。
