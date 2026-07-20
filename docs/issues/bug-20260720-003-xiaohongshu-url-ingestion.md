# BUG-20260720-003：小红书短链误分类与正文抓取失败

- 状态：In Progress / G3（Draft PR #75，远程 CI 证据已建立；未部署）
- 优先级：P1（生产核心规划链路）
- 关联 Requirement：`REQ-AI-001`、`REQ-UX-002`
- ExecPlan：[`小红书链接摄取修复计划`](../plans/bug-20260720-003-xiaohongshu-url-ingestion.md)
- 最近更新：2026-07-20

## 目标

让用户无论在“小红书正文”还是“链接”输入框粘贴受支持的完整链接，都只经过受控链接抓取后再调用模型；兼容小红书当前页面状态中的 JavaScript `undefined`，准确提取当前笔记标题与正文，禁止把裸 URL 当作旅行正文生成无依据城市。

## 生产事故例外

- 用户在 2026-07-20 明确要求立即修复；现有 `TASK-APP-001` 已结束源码实施，只剩部署与真机验收。
- 本项按 P1 生产事故例外临时占用源码写路径，不扩张为第二条产品路线。
- 退出条件：修复与适用门禁完成并进入受检交付；部署、旧错误任务重算和其他小红书能力另行授权。

## 复现与根因

1. 首个脱敏任务日志为 `url=null, hasNoteContent=true`；首页默认正文模式会清空 `url`，裸短链因此直接进入模型，模型生成了与来源无关的城市和 POI。
2. 第二个脱敏任务正确进入链接模式，但抓取器连续两次以“页面有效内容不足”失败，未调用模型。
3. 当前页面在 `window.__INITIAL_STATE__` 的 `note.noteDetailMap.*.note` 下包含正确标题和正文，但对象含 JavaScript `undefined`；Jackson 严格 JSON 解析失败后退到只有 14 个非空白字符的通用 meta description。
4. 现有确定性测试未覆盖“正文框粘贴 URL”和含 `undefined` 的当前页面状态；真实网络抓取测试也没有执行抓取断言。

## 范围内

- 前端识别正文框中的完整小红书 HTTP(S) URL，并归一化为 `url` 请求字段。
- 服务端把仅由绝对 HTTP(S) URL 构成的 `noteContent` 重新路由到受域名白名单保护的抓取器。
- 只在 JSON 字符串外将 JavaScript `undefined` 归一化为 `null`，并优先读取当前笔记结构路径。
- 保留标题、正文长度、域名白名单和内容不足时失败关闭的既有边界。
- 增加 Server 与 Playwright 确定性回归，并以原短链执行一次不调用付费模型的只读抓取验证。

## 范围外

- 不读取用户任务正文或数据库，不修改生产数据，不重算已有错误任务。
- 不更换 AI Provider，不新增浏览器自动登录、Cookie 持久化或反爬绕过。
- 不放宽非小红书域名白名单，不把抓取失败降级为模型猜测。
- 不自动部署、不修改目标机 Secret、TLS、Android 或地图链路。

## 验收标准

- [x] 默认正文框粘贴 `xhslink.com` 或 `xiaohongshu.com` 完整链接时，请求只包含归一化后的 `url`。
- [x] 非前端调用把完整 URL 放入 `noteContent` 时，服务端仍调用抓取器；普通正文中的链接片段不被误分类。
- [x] 含字符串外 `undefined` 的当前页面状态可提取 `noteDetailMap` 中的目标笔记，字符串内同名单词保持不变。
- [x] 通用 meta description 或内容不足仍失败关闭，不向模型提供裸 URL。
- [x] Server 定向测试、Playwright 定向回归、lint、typecheck、build、文档与 Work Item 门禁通过。
- [x] 原短链只读抓取返回青岛标题和正文；不调用真实 AI 或产生模型费用。
- [x] PR 最新 Head 的五项 Required Checks 全绿，并附本次 Frontend smoke 的脱敏截图 Artifact 与 Job Summary。

## G2 验证结论

- Server 定向回归 54/54、扩展相关回归 101/101、全量测试及 `verify` 684/684 通过；Checkstyle 无违规，JaCoCo 门禁满足。
- 本地等价 PR smoke 16/16 通过，其中短链回归确认请求只包含 `url`；360px/390px 脱敏截图 2/2 通过 PNG、CRC、尺寸和元数据安全检查。
- 原短链真实网络只读抓取 1/1 通过，返回青岛标题与正文中的目标 POI；测试直接调用抓取器，不经过 AI 服务。
- `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm eval`、安全合同 22/22、文档与 Work Item 检查以及 `git diff --check` 均通过。
- 当前仅完成隔离 worktree 内的修复与验证，未修改生产数据、未重算历史任务、未提交付费模型请求，也未部署目标环境。

## 远程证据

- PR #75 受检基线 Head `27f3a2117896f13edb35f6ade02664f28dbcd75b` 的 [CI run 29718019522](https://github.com/cyhui555/deeptrail-open/actions/runs/29718019522) 五项 Required Checks 全部成功。
- [Frontend smoke Job Summary](https://github.com/cyhui555/deeptrail-open/actions/runs/29718019522/job/88274998551) 已发布同一运行生成的[脱敏截图 Artifact](https://github.com/cyhui555/deeptrail-open/actions/runs/29718019522/artifacts/8451310846)，保留 7 天。
- `itinerary-mobile-360.png`：360×820，SHA-256 `218af42a8d7fa27c98565de21eebba0da828bfc0d4171a1804af35501f5bf715`。
- `itinerary-mobile-390.png`：390×820，SHA-256 `1c79b4c9ed9e6f4aad8f804b598c9e34b8e6d4129ec7ecb01f680252c62db05a`。

## 回滚

回退表单归一化、内容服务 URL 识别、状态解析器及对应测试即可；不涉及数据库迁移、API 字段新增、目标环境配置或用户数据变更。
