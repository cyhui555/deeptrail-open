# M13 测试与交付审计

- 审计日期：2026-07-16
- 范围：M12 用户可见回归、浏览器协议边界与 Playwright 稳定性
- 限制：仅检查和修改 `tests/**`、`docs/verification/**`；未访问真实第三方服务或真实用户数据

## 覆盖结论

| 能力 | 审计前证据 | 本次补强 |
| --- | --- | --- |
| SSE 回退 | 服务层所有权与事件测试；缺少浏览器回退链路 | 模拟 SSE 503，验证页面通过后备轮询呈现最终完成状态 |
| RUM 脱敏 | 服务端白名单测试；缺少浏览器实际 payload 证据 | 捕获 `sendBeacon`，验证仅发送 `name/value/rating/pageGroup`，不包含 URL 查询隐私 |
| 行程分页 | 有首屏并发性能测试；缺少“加载更多”和去重证据 | 验证第二页可见，并按行程 ID 去除跨页重复项 |
| 地图列表联动 | 已有键盘选择、列表高亮、地图标记切换和跨天联动测试 | 无需重复新增 |
| PWA 边界 | 已验证公共离线壳可匿名访问 | 增加真实 Cache Storage 检查，认证页、API 和查询隐私均未进入缓存 |
| 品牌更名 | 首页标题、应用导航和离线壳已有“旅迹”断言 | 当前非归档内容仅保留历史 Requirement 中的“旅轨”事实，不属于用户界面残留 |

新增用例位于 `tests/e2e/m13-quality-boundaries.spec.ts`，均使用本地确定性替身或同源浏览器能力，不使用 `force`、`networkidle` 或固定等待。

## Playwright 稳定性审计

- 当前测试中未发现 `force: true` 或 `networkidle`。
- 仍有 15 处 `waitForTimeout`，集中在地图标记生命周期、坐标修正、自定义地点、首页提交刷新和日期摘要测试。
- 仍有较多 `.first()` / `.nth()` 位置选择器；部分用于验证“第一个地点/第二个标记”等真实顺序语义，但 `trip-plan.spec.ts`、`node-revision.spec.ts` 中仍存在可改为角色、标签或容器过滤的旧选择器。
- 最高风险固定等待是 `custom-item-edit.spec.ts` 的 5 秒等待，以及 `home.spec.ts`、`day-summary.spec.ts` 的 2 秒等待。建议在后续独立清理中改为等待对应 API 响应、状态徽标或加载骨架消失，避免与功能交付混改。

## 验证

- `pnpm exec playwright test tests/e2e/m13-quality-boundaries.spec.ts --list`：3 条用例可发现。
- `node scripts/run-e2e.mjs m13-quality-boundaries.spec.ts`：3/3 通过。
- 浏览器验收仅使用本地 API、AI 替身、路由替身和 Cache Storage；未访问真实 AI、地图或第三方站点。

## 未处理项

- 本次没有机械改写既有 15 处固定等待，避免在并行开发期间扩大共享文件冲突；风险位置已在上文记录。
- 未重复新增地图列表和品牌测试，因为现有用例已经覆盖用户可见结果。
