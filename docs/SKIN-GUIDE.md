# dsh-auto-memory 皮肤开发白皮书（SKIN-GUIDE）

> 面向：想给本插件做皮肤的用户与开发者。
> 承诺：**照本指南做皮肤，不碰一行逻辑代码**；经典档（classic）始终保持字节级零改动。
> 本文所有接口、键名、守卫均与 lib/client.js / lib/index.js / lib/wb-sidecar.js 实际代码逐字对拍（2026-09-28 真机验证轮）。

---

## 0. 三层 Key 哲学（先读这个）

插件的"可换皮"建立在三层解耦上，**每层各管一件事**：

| 层 | 形态 | 管什么 | 改它会影响逻辑吗 |
|---|---|---|---|
| ① Token | CSS 变量 `--skin-*` / `--dam-*` | 颜色/圆角/间距/时长/阴影 | 否——纯外观 |
| ② Anchor | DOM 属性 `data-dam-*` / `data-dam-skin-v4-*` | 结构挂载点（测试与皮肤定位用） | 否——只要锚点在 |
| ③ Asset | 素材槽 `assetOf(key, deep)` | 图片/插画/背景（明暗双份） | 否——换图=改一行 |

纪律红线：**任何皮肤工作不得改动逻辑分支、不得删除锚点、不得在样式里写裸色值**（见 §8 守卫）。

---

## 1. 30 秒最小皮肤

不写代码的最小换肤 = 覆写 token。皮肤包就是一个目录：

```
skins/<your-skin>/
  theme.json    ← token 定义（与 CSS 同源，单一事实）
  skin.css      ← 可选：追加规则
  README.md     ← 说明
```

`theme.json` 里每条 token 都是 `名称 → 值`。参考实现：`skins/v4/theme.json`（开发版）与 `skins/classic/theme.json`（经典档，保持出厂值）。

---

## 2. 皮肤注册与切换

- 当前皮肤存于 `localStorage['dam-skin']`（`'classic'` | `'v4'`），fail-closed：读不到/非法值一律回落经典。
- 用户入口：记忆面板头部按钮——经典档显示「**开发版**」，开发版显示「**经典**」（2026-09-28 起「新款」已更名「开发版」，标示其未完成态）。
- 切换即热生效（`setNonce` 重渲染，不 reload）；切回经典时移除注入的 `<style id="dam-skin-v4-style">`。
- 开发版渲染抛错时走 **ES5 错误边界**（`DamSkinV4Boundary`，getDerivedStateFromError 原型继承写法），屏上显示错误条并**整页回落经典**——皮肤永远不能弄死面板。

---

## 3. Token 契约（① 层详解）

### 3.1 开发版（v4）token——定义在 `[data-dam-skin-v4-root]` 一行内

| token | 出厂值 | 语义 |
|---|---|---|
| `--skin-brand` | `#4F7CFF` | 主色（DeepSeek 蓝） |
| `--skin-brand-weak` | `#EAF0FF` | 主色弱底 |
| `--skin-team` | `#7C5CFF` | 团队色 |
| `--skin-ok / warn / err / info` | `#22C55E / #F59E0B / #EF4444 / #3B82F6` | 语义色 |
| `--skin-bg / surface / border` | `#F6F8FC / #FFFFFF / #E8ECF3` | 底/面/线 |
| `--skin-text / text-2 / text-3` | `#1F2937 / #6B7280 / #9CA3AF` | 文字三级 |
| `--skin-radius-card / btn / pill` | `14px / 8px / 999px` | 圆角三档 |
| `--skin-shadow-card / pop` | 两段阴影 | 阴影两档 |
| `--skin-sidebar-w` | `224px` | 侧栏宽 |
| `--skin-dur-quick / fast / slow` | `120 / 200 / 320ms` | 动效时长 |
| `--skin-space-3 / 4 / 5` | `12 / 16 / 24px` | 间距三档（2026-09-28 补定义——此前被 10+ 规则引用但从未定义，静默失效） |

### 3.2 经典档（--dam-*）与"消费未定义白名单"

经典档 token 由经典皮肤定义。**扫描器 r15 允许"消费了但未定义"的 `--dam-*` 变量仅存在于白名单**（`EXPECT_TOKENS`）：`user-scale / radius / team-actor-hue / skin-backdrop-opacity / bg-deep`，且每条必须带兜底值。你新增消费时若不在这个名单里，要么自己定义、要么进白名单（须写明理由——这是守卫演进纪律，不是后门）。

### 3.3 零字面色纪律（按段生效）

- **团队屏段**（fe02 §8.3，`屏①–④` 标记到 `L3-team:end`）：hex / `rgba(`/`hsla(` **一个都不许出现**。动态色走变量：JS 行内只写**色相数字** `'--dam-team-actor-hue': String(hue)`，CSS 消费 `hsl(var(--dam-team-actor-hue, 0) 62% 46%)`。
- **团队 CSS 段**（`dam-team:begin..end`）：同上，且 var() 兜底里**嵌套 rgba 也会被抓**（§9.2 只豁免匹配串内直接含 `var(` 的色函数）——兜底请用裸 `var(--token)` 不带字面值。
- **皮肤 CSS（v4 注入块）**：无裸 hex/rgba；写 `var(--skin-*)` 或 `color-mix()`。

---

## 4. Anchor 契约（② 层）

- 命名：经典档 `data-dam-<域>-<名>`（如 `data-dam-team-presence`）；开发版 `data-dam-skin-v4-<名>`。
- 用途：a) 测试锁（r15/r18/r26 全靠锚点断言）；b) 皮肤定位挂载点。
- 查法：`grep -o "data-dam-[a-z0-9-]*" lib/client.js | sort -u`（当前 1800+ 个）。
- 加新锚点：**只增不改**——改值/改名会炸既有测试锁。团队屏锚点契约见 fe02 §2–§5（statusbar/members/filterbar/skills/conflicts 八屏）。

---

## 5. 素材槽（③ 层）

- 定义：`lib/skin-assets.js` → `assetOf(key, deep)`；清单 `lib/assets/skin/_manifest.json`（暗色 `_manifest-dark.json`）。
- 槽位：`hero`（各屏头图）等，`deep=true` 取暗色文件（`fileDark`），`useDeepTheme()` 自动跟随宿主明暗。
- **换图 SOP = 改 `skin-assets.js` 对应槽位的 `file` 一行**，结构与所有消费代码零改动；未就绪槽位显示确定性占位（不塌、不留白）。

---

## 6. ★读数 ↔ 接口对照表（数据从哪来、往哪写）

> 前端两条铁律：**读**必经 `configOf()` 解包（GET /config 恒回外壳 `{config, path}`，直读外壳=经典 bug 温床）；**写**必经 `saveConfigPatch(patch)` 唯一出口（自带错误处理与向导闸联动）。

| 屏/读数 | 接口 | 方法 | 关键字段 | 前端消费点 |
|---|---|---|---|---|
| 配置读写 | `/api/dsh-auto-memory/config` | GET / POST | GET 外壳 `{config}`；POST patch 即时写盘 | `configOf(d)` / `saveConfigPatch` |
| 面板状态 | `…/state?ws=<工作区>` | GET | `todayEntries`、`autoStats.count/lastAt` | 首页统计卡、设置数据规模卡（同源） |
| 工作区列表 | `…/workspaces` | POST `{force:false}` | `workspaces[].name` | 首页/设置 |
| 白板看板 | `…/kanban-board` | GET | `lanes`（列表态）+ `matrix{columns,rows,stats}`（矩阵态）、`stats.totalCards/dateFrom/dateTo/missingDeadend`、`foldDays`/`includeArchive` 参数 | `KanbanView`（整页）/ 侧栏列表 |
| 小节卡构建 | （服务端内部）`_collectWhiteboardDocsPre` + `buildSectionCardsPre` | — | 卡=`##`小节；`kind: plan/ledger/archive`；标题/预览见 §7 | — |
| 语义引擎状态 | `…/semantic-status` | GET | `resolvedTier(c1/c2/c3)`、`activationEmitMode`、下载相位 | 设置引擎卡 |
| 唤回方式 | `…/semantic-emit` | POST `{mode}` | `shadow / canary-explicit / active` | 设置分段控件（**不经 config 写盘**，与经典档同路径） |
| 团队成员 | `…/team-members` | GET | `{enabled, self, members, project}` | 团队屏② |
| 团队在场 | `…/team-presence` | GET | `{enabled, self, others, note}` | — |
| **谁改动** | `…/team-attribution` | GET | `{enabled, actor, calendar, calendarInfo, attribution:{size,writes,items:[{key,memberId,memberName,at,op}]}}` | TeamTab 归属行 + 成员行摘要（2026-09-28 正式接线） |
| 团队冲突 | `…/team-conflicts` | GET | `{enabled, policy, counts, conflicts}` | 冲突中心 |
| 团队技能 | `…/team-skills` | GET | `{enabled, count, candidates}` | 屏⑤ |

**注意**：设置里的开关要"活"，键必须在服务端 `DEFAULT_CONFIG` 白名单（index.js）——否则写了被 /config 静默丢弃（死开关，P0-7 同类缺口；`teamShowMemberBadges` 于 2026-09-28 补入，默认 `true`）。

---

## 7. 白板看板读数细则（2026-09-28 修）

- 数据源 = `handoff/PLAN.md`（**白板**，kind='plan'）+ `handoff/handoff-*.md`（**交接账本**，kind='ledger'）+ 可选 archive。看板是两者的合并投影——卡上「白板/账本/归档」**来源徽章**即为此而设。
- 卡片标题：`##` 小节标题；若标题是**纯时间戳**（去日期/分隔符后与文档标题同核），自动取本节正文首个非标记行作**语义标题**（主键 id/归并口径不变，只改显示）。
- 卡片预览：**已剔除 `type:goal/state/dead-end/progress/archive` 标记行**（标记仍供落泳道消费——路由口径零改动，只是不再裸显机器键）。
- 落泳道：标题或正文写 `type:*` 标签 → 四泳道；不写则按标题猜，常落空（这是给写手的约定，见 index.js 提示词 §⑤）。

---

## 8. 屏分发与挂载（做全屏皮肤看这里）

- 开发版 10 屏：`DAM_SKIN_V4_PAGES`（首页/记忆库/召回审查/时间线/日历提醒/思维导图/外部记忆/交接账本/欢迎引导/设置）。
- 其中 7 屏**复用经典组件**套 v4 壳：`DAM_SKIN_V4_HOSTED = { library: MemoryHubTab, recall: RefineTab, timeline: LogsTab, calendar: CalendarTab, mindmap: WorkspaceTab, external: StorageTab, handoff: PlanTab }`——同源数据零重写。
- welcome / settings 为自建屏（读数全部走 §6 表；设置控件逐键映射真实 config 键，改动即时落盘、与经典档双向同源）。
- 挂载协议：`MemoryPageView` 按 `damSkinActive()` 分支；经典节点作为**错误边界 fallback** 传入（懒工厂 `damSkinBoundaryOf()`，smoke 环境无完整 React 时返回 null 自动走经典）。

---

## 9. 组件协议（皮肤可复用的既有件）

| 组件 | 用途 |
|---|---|
| `SkinSlot` | 通用挂载点（区别于设置页预览卡） |
| `SkinHero` / `SkinImg` | 头图/插图（走 assetOf；未就绪出占位） |
| `SkinBackdrop` / `useDeepTheme` | 背景层 / 明暗自动跟随宿主（MutationObserver） |
| `SkinCenterPanel` / `SkinSlotRows` / `SkinSection` | 设置页皮肤分区的预览/换图行 |

---

## 10. 验收纪律（交皮肤前必须全绿）

1. `node tools/lib/appearance-scan.mjs` → exit 0（无裸色值）。
2. `node tests/smoke/smoke-test-r15-left-rail.mjs` → 全过（含 ㊷b token 白名单 / ㊸b 兜底纪律）。
3. `smoke-test-r18-fe02-screens.mjs`（团队段零字面色 §8.3 / 接线点恰 1 处）、`smoke-test-l3-team.mjs`（§9.2 团队 CSS 段）、`smoke-test-r26-cross-layer.mjs`（**E3 宿主 index.js 基线锁**——改 index.js 必须留痕换基线）。
4. 全量：`node tools/run-smoke.mjs`（当前 224 项）。
5. **经典档零改动红线**：切回经典后逐屏对拍，字节级行为不变。
6. 真机：重启 DeepSeek Harness（三重判据：PID 变更 + client.js mtime 早于宿主启动 + 19387 在听），computer-use 逐屏截图对拍。

## 11. 已知边界（开发版 = 未完成态，如实标示）

- 暗色主题未做（v4 token 仅有日间档）；7 个托管屏为经典内容套壳（功能完整、视觉未精修）。
- 设置屏侧栏「返回经典皮肤」按钮在窄高度下可能被挤出可视区（AX 可达）。
- 欢迎引导四页已真机全过；`window['dsh-auto-memory.TOUR_STEPS']` 为向导内容**单一来源**（定义在 DialogHost 早退之前——顺序不能倒，否则开发版第 2/3 页空白）。

---
*维护约定：本文与代码同迁——改接口/键名/守卫，同提交更新本表；对不上的行以代码为准并回改本文。*
