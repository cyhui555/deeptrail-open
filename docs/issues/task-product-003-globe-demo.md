# TASK-PRODUCT-003：3D 旅行地球演示

- 状态：Review / G3（独立展示页与全局打卡 3D 首版已完成本地验收）
- 优先级：P1
- 关联 Requirement：`REQ-PRODUCT-003`
- 用户准入：2026-07-24，先完成可展示的 Demo，后续再评估是否合入正式产品流程

## 目标

在现有 Web 工程中新增一个独立的 `/globe-demo` 页面，用真实 WebGL 3D 地球展示示例地点、旅行飞线与路线信息；视觉参考 Google Earth 的全球视角，但不虚构已经接入 Google 数据。在原型验收后，将同一套地球能力以按需渲染器接入“现场打卡”的全局行程，验证真实打卡点、跨天路线和 GPS 轨迹的产品闭环。

## 范围内

- 新增匿名可读的独立 Demo 路由；只放行精确 `/globe-demo` 路径，不改变现有业务路由的认证规则。
- 地球支持拖动旋转、滚轮或手势缩放、自动旋转、城市标记、路线飞线和目的地选择。
- 地表使用真实卫星纹理、地形凹凸、海洋高光与薄大气层，国界只作弱提示，不遮挡真实地表。
- 点位使用统一地点模型，包含稳定 ID、地点类型、中英文名称、ISO 国家码、坐标与显示短码；后续著名景点可以与城市共享选中、标签和路线能力。
- 增加路线城市与著名景点图层切换；景点在地球上显示名称标注，点击列表、地球点位或文字标注均能联动视角与详情。
- 首批景点与五个路线城市一一关联，使用可核对的 Wikidata QID 与坐标，不把演示短码或文案当作外部实体主键。
- 每个景点提供经过来源核对的介绍正文、三个核心看点和参考链接；地球点位悬浮提示与选中详情都能看到介绍信息。
- 每个景点使用可核对许可的实景图片；景点列表改为图片卡片，选中详情以更大的图片卡片承载介绍、看点、资料来源和图片署名。
- 独立 Demo 使用明确标注的示例数据，不读取真实用户数据，不调用后端或付费外部服务。
- 提供加载、失败、减少动态效果和窄屏布局，覆盖桌面、390px 与 360px 视口。
- 通过浏览器运行并生成工作区外的临时截图，供工程所有者查看效果。
- 在受保护的现场打卡页增加“平面地图 / 3D 地球”切换，默认仍使用平面地图；选择 3D 地球时自动进入全局行程范围。
- 3D 地球直接消费现有 `CheckinItem`、`TrackPoint`、路线模式和选中状态，展示计划路线、实际路线、GPS 轨迹、待打卡点与已打卡点。
- 地球点位、打卡列表和跨天选择双向联动；点位操作定位到现有打卡卡片，由原有打卡、撤销、离线补偿和媒体流程完成业务写入。
- 3D 渲染器按用户操作动态加载，并提供 WebGL 不可用、资源超时、空数据、重试和减少动态效果状态；不让 Three.js 进入默认平面地图首屏。

## 范围外

- 不新增或改写打卡、轨迹、离线队列、鉴权、API 与数据库契约；3D 层不维护第二份打卡状态，也不新增独立写入口。
- 景点大图介绍卡继续保留在独立 Demo；正式打卡页首版复用现有行程卡片，不在地球上重复一套详情和媒体编辑流程。
- 本轮不直接抓取或复制 Google Earth 瓦片；Google Photorealistic 3D Tiles 只作为后续正式 Provider，需要 API Key、Map Tiles API、计费、兼容渲染器与持续版权归因。
- 不改动主导航、首页信息架构、业务 API、数据库、Android 壳或生产配置；正式产品改动只限现场打卡页的地图渲染器切换。
- 不在本任务中推送、创建 Pull Request、合并或部署。
- 不承诺最终产品视觉；本任务只交付可复用的技术与视觉原型。

## 验收标准

- [x] 未登录访问 `/globe-demo` 不会跳转登录页；首屏在地球资源加载期间显示匹配最终布局的加载状态，失败时提供可理解的重试入口。
- [x] 桌面端可拖动、缩放、暂停或恢复自动旋转，并可选择至少 4 个示例目的地；飞线与信息区同步更新。
- [x] `prefers-reduced-motion` 下取消自动旋转和非必要循环动画，核心选择与地球操作仍可用。
- [x] 390px 与 360px 视口无横向溢出，主要文字、按钮和地球交互区保持可见。
- [x] `pnpm lint`、`pnpm typecheck`、适用测试与 `pnpm build` 通过；真实浏览器完成桌面和移动端视觉验收。
- [x] 地球在桌面与移动端均能清晰辨认真实海陆、山脉、冰盖和海洋层次，国界与路线不遮挡卫星地表。
- [x] 地点数据模型可同时表达城市与著名景点，不以机场三字码或单一 `city` 字段作为长期主键。
- [x] 可在“路线城市”和“著名景点”之间切换，切换后地球点位、文字标注、列表与详情保持同一数据集合。
- [x] 至少 5 个标准景点具有稳定内部 ID、关联城市、中英文名、类别、经纬度、ISO 国家码与 Wikidata QID。
- [x] 选择任一景点会暂停自动旋转、平滑聚焦并显示位置、类别和简介；减少动态效果时改为立即聚焦。
- [x] 五个景点均提供介绍正文、三个核心看点和参考来源，选中景点后直接显示，不需要再次展开。
- [x] 悬浮地球点位或文字标注时显示景点简介，点位、标注与详情使用同一份介绍数据。
- [x] 五个景点均具有实景图、描述性替代文本、作者、许可协议和原始文件页，图片许可可以从界面直接核对。
- [x] 著名景点列表使用图片卡片；选中景点后显示更大的图文介绍卡，图片加载失败时提供不影响地点选择与介绍阅读的回退状态。
- [x] 现场打卡默认保持平面地图；切换 3D 后自动使用全局行程，并按需加载 WebGL 运行时。
- [x] 3D 地球与打卡列表共用跨天地点、路线模式和选择状态，点击或键盘触发点位后定位到现有打卡卡片。
- [x] 计划路线、实际路线与 GPS 轨迹沿用现有数据和筛选逻辑；打卡、撤销与离线重放没有新增分支。
- [x] 3D 加载、空数据、WebGL 失败、纹理超时、重试、减少动态效果和 390px 窄屏均有可理解状态。

## 第一轮验证基线

- 仓库级 `pnpm lint`、`pnpm typecheck`、`pnpm test` 与当前完整树的 `pnpm build` 通过；默认服务端测试基线为 684/684。
- 最终生产构建中 `/globe-demo` 为静态路由，路由本体 6.03 kB、First Load JS 101 kB；Three.js 地球通过客户端动态加载，不进入全站共享首屏包。
- `next start` 生产模式下专项 Playwright 4/4 通过，覆盖匿名访问、城市选择、旋转控制、390px、360px 和减少动态效果。
- 1440×900 与 390×844 真实浏览器截图已保存在 Git 工作树外；两种视口均无页面错误，390px 页面级横向溢出为 0。
- 本任务不调用 AI、地图 Provider、付费服务或真实用户数据，因此 `pnpm eval` 与真实外部服务验证不适用。

第二轮视觉升级完成后必须重新运行同等级门禁并替换截图；第一轮 G3 结果只作为回归基线，不代表当前改动已验收。

## 第二轮验证结果

- 地球改为 Blue Marble 真实卫星地表、地形凹凸、海洋高光、真实星空、薄大气层与弱国界线；四项固定版本 CDN 纹理在桌面与移动浏览器均加载成功，请求失败为 0。
- 地点模型已使用稳定内部 ID、`city | landmark` 类型、中英文名称、ISO 国家码、坐标、显示短码及可选 Google Place ID/Wikidata QID；路线只依赖统一地点协议。
- 仓库级 `pnpm lint`、`pnpm typecheck`、`pnpm test` 与当前完整树的 `pnpm build` 通过，服务端测试基线保持 684/684。
- 最终生产构建中 `/globe-demo` 为静态路由，路由本体 6.29 kB、First Load JS 101 kB；Three.js 地球仍通过客户端动态加载。
- `next start` 生产模式下专项 Playwright 4/4 通过；1440×900、390×844 与 360×800 均无页面级横向溢出，截图检查无页面错误、控制台错误或失败请求。
- Google Photorealistic 3D Tiles 尚未接入：当前工作区没有正式 API Key；后续必须使用官方 Map Tiles API、兼容渲染器、计费与持续版权归因，不能以抓取瓦片替代。

## 第三轮验证结果

- 新增“路线城市 / 著名景点”双图层；东方明珠广播电视塔、布达拉宫、圣索菲亚大教堂、哈尔格林姆教堂与斯坦利公园均具有稳定内部 ID、关联城市、双语名称、类别、坐标、ISO 国家码和 Wikidata QID。
- 地球点位、英文画布标签、横向或纵向列表与详情共用同一图层数据；点击列表、地球点位或标签均会暂停旋转并聚焦，`prefers-reduced-motion` 下立即切换视角。
- 仓库级 `pnpm lint`、`pnpm typecheck`、`pnpm test` 与 `pnpm build` 通过，默认服务端测试保持 684/684。
- 最终生产构建中 `/globe-demo` 仍为静态路由，路由本体 7.86 kB、First Load JS 102 kB；Three.js 地球保持客户端动态加载。
- `next start` 生产模式下专项 Playwright 5/5 通过；1440×900、390×844 与 360×800 均无页面级横向溢出，最终桌面和移动截图的页面错误、控制台错误与失败请求均为 0。
- Lighthouse 13.4.1 桌面审计为 Accessibility 100、Best Practices 96、SEO 91、Performance 59；LCP 2.1 秒、CLS 0，TBT 750 毫秒。WebGL 运行时代码和 4.8 MiB 卫星纹理是正式合入前需要单独设定预算与优化的已知成本，不阻断本轮视觉原型验收。
- 用户已允许后续使用 Google 受限地图素材，但当前仍未配置正式 API Key；任何 Google Provider 接入继续要求官方 API、计费、归因和配额治理，本轮没有抓取或缓存 Google 瓦片。

## 第四轮验证结果

- 五个标准景点均补齐经过官方或 UNESCO 页面核对的介绍正文、三个不重复核心看点和 HTTPS 参考来源；数据模型在运行时校验介绍长度、看点数量与唯一性以及来源协议，避免后续新增景点时静默降级。
- 选中景点后直接展示完整介绍、核心看点与资料来源，不新增二次展开层级；地球点位和文字标注悬浮时显示同一地点数据生成的短摘要。
- 仓库级 `pnpm lint`、`pnpm typecheck`、`pnpm test` 与 `pnpm build` 通过，默认服务端测试保持 684/684；最终 Web 生产构建再次独立通过。
- `/globe-demo` 保持静态路由，路由本体 9.45 kB、First Load JS 104 kB；介绍数据没有进入全站共享首屏包。
- `next start` 最终生产构建专项 Playwright 5/5 通过，用时 46.3 秒；覆盖完整景点介绍、三个核心看点、UNESCO 来源链接、点位悬浮摘要、390px、360px 和减少动态效果。
- 1440×900 与 390×844 成品截图无页面级横向溢出，页面错误、控制台错误和失败请求均为 0；移动端介绍、来源入口、核心看点和地球交互区均保持可见。
- Lighthouse 13.4.1 桌面审计为 Accessibility 100、Best Practices 96、SEO 91、Performance 60；LCP 2.3 秒、CLS 0、TBT 670 毫秒。WebGL 与卫星纹理仍是正式合入前需要独立性能预算的主要成本。

## 第五轮验证结果

- 五个标准景点均接入 Wikimedia Commons 的 960px 实景缩略图，并在数据模型中保留描述性替代文本、作者、许可协议、许可地址与原始文件页；界面可直接核对图片署名和许可。
- 著名景点列表改为横向图片卡片；选中景点使用更大的图文卡承载名称、位置、类别、介绍、三个核心看点、资料来源和图片署名。图片请求失败时显示明确回退状态，地点选择与文字介绍保持可用。
- 仓库级 `pnpm lint`、`pnpm typecheck`、`pnpm test` 与 `pnpm build` 通过，默认服务端测试保持 684/684；最终生产构建中 `/globe-demo` 为静态路由，路由本体 10.8 kB、First Load JS 105 kB。
- `next start` 最终生产构建专项 Playwright 6/6 通过，覆盖五张图片卡、布达拉宫大图与授权链接、图片加载失败回退、390px、360px 和减少动态效果；点位悬浮专项连续复跑 3/3 通过。
- 1440×1000 与 390×844 最终截图均无页面级横向溢出；五张卡片图片和选中大图在真实浏览器中的 `naturalWidth` 均为 960，WebGL 与图片请求没有页面脚本错误。视觉截图隔离了本地未启动后端时可选 Web Vitals 上报产生的 500 响应。
- Lighthouse 13.4.1 桌面审计为 Accessibility 100、Best Practices 96、SEO 91、Performance 53；FCP 0.9 秒、LCP 2.3 秒、CLS 0、TBT 1,740 毫秒。WebGL 主线程开销仍是正式合入前需要单独设定预算与优化的已知成本，不阻断本轮视觉原型验收。

## 第六轮验证结果

- 现场打卡页新增“平面地图 / 3D 地球”渲染器切换；默认平面地图行为不变，进入 3D 时自动切到全局行程。两种渲染器共用 `mapItems`、`displayTrackPoints`、路线模式、跨天配色和 `selectedItemId`，没有复制打卡写逻辑。
- 3D 地球显示真实卫星地表、国界、中文地点标签、待打卡与已打卡状态，并支持计划路线、实际路线和 GPS 轨迹；点位按钮可用指针或键盘触发，随后定位到既有打卡卡片。
- 仓库级 `pnpm lint`、`pnpm typecheck`、`pnpm test` 与 `pnpm build` 通过，服务端测试保持 684/684。打卡地图整组 Playwright 7/7、地图路线与窄屏相关回归 12/12、最终生产模式独立 Demo 6/6 与打卡 3D 联动 1/1 通过。
- 最终生产构建中 `/trips/[planId]/checkin` 路由本体 13 kB、First Load JS 135 kB；Three.js 和地球画布继续通过客户端动态加载，不进入默认平面地图首屏。
- 使用后端真实打卡任务构造五个跨城地点后，1440px 与 390px 生产浏览器截图均显示五个中文点位和路线；390px 文档宽度等于视口宽度，页面错误、控制台错误和失败请求均为 0。
- 默认平面地图状态的打卡页 Lighthouse 13.4.1 桌面审计为 Performance 97、Accessibility 100、Best Practices 96、SEO 100，FCP 0.8 秒、LCP 1.2 秒、TBT 0、CLS 0.002，证明 3D 依赖未阻塞默认首屏。
- 独立 WebGL 场景的同轮桌面审计为 Performance 51、Accessibility 100、Best Practices 100、SEO 91，LCP 1.9 秒、CLS 0；无 GPU 的 Headless Chromium/SwiftShader 环境记录到 33.38 秒 TBT。3D 主线程与纹理成本继续作为正式默认化前的性能预算项，首版通过按需加载和保留 2D 回退控制影响。

## 景点数据参考

- [东方明珠广播电视塔 Q223207](https://www.wikidata.org/wiki/Q223207)
- [布达拉宫 Q71229](https://www.wikidata.org/wiki/Q71229)
- [圣索菲亚 Q12506](https://www.wikidata.org/wiki/Q12506)
- [哈尔格林姆教堂 Q271466](https://www.wikidata.org/wiki/Q271466)
- [斯坦利公园 Q1126258](https://www.wikidata.org/wiki/Q1126258)
- [东方明珠官方介绍](https://english.shanghai.gov.cn/en-ScenicSpots/20231205/19a5f5184eca45728fd57a4d4c8efc61.html)
- [布达拉宫 UNESCO 世界遗产介绍](https://whc.unesco.org/en/list/707)
- [伊斯坦布尔历史区与圣索菲亚 UNESCO 介绍](https://whc.unesco.org/en/list/356)
- [哈尔格林姆教堂官方建筑与历史介绍](https://www.hallgrimskirkja.is/en-gb/husi%C3%B0-og-sagan)
- [斯坦利公园温哥华市官方介绍](https://vancouver.ca/parks-recreation-culture/stanley-park.aspx)

## 景点图片参考

- [东方明珠实景图，Gerd Eichmann，CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:Shanghai-Skyline-52-Flusspanorama_mit_Oriental_Pearl_Tower-2012-gje.jpg)
- [布达拉宫实景图，Ondřej Žváček，CC BY 2.5](https://commons.wikimedia.org/wiki/File:Potala.jpg)
- [圣索菲亚实景图，Arild Vågen，CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg)
- [哈尔格林姆教堂实景图，Jakub Hałun，CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:Hallgr%C3%ADmskirkja,_Reykjav%C3%ADk,_Iceland,_20230506_1701_5380.jpg)
- [斯坦利公园实景图，Tim，CC BY-SA 2.0](https://commons.wikimedia.org/wiki/File:Aerial_view_of_Vancouver_and_Stanley_Park,_2006-09-12.jpg)

## 验证

- 验证：从仓库根目录运行静态检查、测试和生产构建，再使用真实浏览器检查交互、控制台、桌面与窄屏截图。

## 回滚

- 回滚：删除独立路由、地球组件、样式与新增前端依赖即可完整回退；本任务不涉及 Schema、持久化数据或外部系统写入。
