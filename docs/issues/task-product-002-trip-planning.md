# TASK-PRODUCT-002：行程日期视图与任务筛选

- 状态：G3 / Ready for Review（实现与本地门禁完成，待受检合入）
- 优先级：P1
- 关联 Requirement：`REQ-PRODUCT-002`
- ExecPlan：[行程规划管理计划](../plans/task-product-002-trip-planning.md)
- 分支：`feat/task-product-002-trip-planning`

## 目标

让用户在“我的行程”中完成新建、查看和安全删除，并可通过按月日期视图理解当前规划；同时让首页“最近任务”可以按任务类型和执行状态筛选。

## 范围内

- 保留现有空白行程创建路径，为行程列表和日期视图补充带确认的软删除入口。
- 为“我的行程”增加列表与月历切换、月份导航、回到今天、跨日期范围投影和无日期行程提示。
- 最近任务支持按 `TaskType` 与 `TaskStatus` 组合筛选，服务端分页、总数和轮询均使用同一筛选条件。
- 保持当前用户归属校验、既有路由、移动端布局和无障碍交互。

## 范围外

- 不增加硬删除、回收站、批量删除或恢复能力。
- 不支持拖拽改期、重复日程、外部日历同步或新的数据库字段。
- 不改变 AI 生成、优化 Prompt、地图、打卡、Android 原生壳或部署流程。

## 验收标准

- [x] 用户可创建空白行程，并可从列表或日期视图发起删除；确认后行程消失，取消或请求失败时数据不被误移除。
- [x] 用户可在列表和月历间切换，可切换上月、下月和今天；`tripDates` 的有效首末日期按天投影，缺失范围时回退 `plannedDate`，无日期行程不静默丢失。
- [x] 状态筛选对列表与月历一致生效，加载、空、错误和分页状态可辨认；360px 与 390px 无横向溢出。
- [x] 最近任务可组合选择类型与状态；API 在当前用户范围内过滤，分页总数、翻页、空状态和后台轮询均与筛选一致。
- [x] 服务端定向测试、前端 lint/typecheck、生产构建及 Playwright 用户路径回归通过，无真实 AI、地图或用户数据调用。

## G0 验证

- 服务端：`pnpm --filter @deeptrail/server test`、`pnpm test:contract`、`pnpm verify:server`。
- 前端：`pnpm lint`、`pnpm typecheck`、`pnpm build`，并运行本任务新增的确定性 Playwright 回归和适用 smoke。
- Eval：功能不修改 Prompt 或 Provider；仍在 G2 执行仓库确定性 `pnpm eval`，不调用真实付费服务。

## G3 验收证据

- 仓库门禁：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm verify:server`、`pnpm eval` 与 `pnpm build` 全部通过；服务端测试为 684/684，Checkstyle 0 违规，JaCoCo 阈值满足。
- 浏览器门禁：`pnpm test:e2e:smoke` 为 16/16；`pnpm test:e2e task-product-002.spec.ts` 为 3/3，覆盖日期闭区间、待安排日期、删除取消/成功/失败、筛选组合、翻页条件保持和空状态恢复。
- 响应式与视觉：真实 Edge 验证桌面月历，并在 390px 与 360px 断言无横向溢出；视觉沿用暖纸张、矿物蓝、毛玻璃和既有 Lucide 体系，没有引入新依赖或第二套主题。
- 构建预算：首页为 15.1 kB / 117 kB First Load JS，`/trips` 为 13.9 kB / 116 kB；没有调用真实 AI、地图、付费服务或用户数据。

## 交付边界

- 当前实现将通过独立短期分支和受检 Draft PR 交付；尚未合并、未部署，生产发布仍需工程所有者另行确认。
- 删除继续使用既有用户归属校验和软删除语义；回收站、恢复、批量删除和拖拽改期仍在范围外。

## 回滚

- 回滚：回退本任务代码和文档提交即可恢复旧界面与旧查询参数；没有 Schema 迁移，既有软删除记录不做数据覆盖。
