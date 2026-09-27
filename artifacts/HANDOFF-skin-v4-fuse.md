# 皮肤 v4 施工交接（2026-09-27 深夜 · 判定人施工 · 已推进到批次2屏1上屏）

## ✅ 已解决（真机实证）
1. **灰屏根因闭环**：v4 子树懒求值抛错逃出 try/catch → 宿主槽位边界灰 fallback。
   修法 = 自建 ES5 原型链 React 错误边界（懒工厂 `damSkinBoundaryOf()`，兼容冒烟环境部分 React mock）+
   fallback=经典整页+**屏上显错**。实战一次命中 `nonce is not defined`（7718 裸引用）→ 修复 → v4 渲染成功。
2. **熔断已撤**：`damSkinActive()` 恢复真实逻辑；热切换双向可用（经典头部「新款」⇄ v4 侧「返回经典」）。
3. **布局堆叠已修**：`[data-dam-skin-v4-page]{display:flex}` —— root>page>aside+main 三层，page 层缺 flex 致竖堆。
4. **home 屏 v1 上屏**（截图 20260927-81）：4 真数据卡（0/92/8/✓）+ 工作区行列表 + 今日小结。

## 当前上屏态（home v2,字节 ≈915,027 / 10AA9BE42AE37ED8 后又有 CTA/hero 修,重启 56364 已加载）
- 横幅（品牌渐变+真计数+CTA跳时间线）+ 4 图标瓦片统计卡 + 双栏（工作区行列表/今日小结+快捷入口）
- 截图 20260927-90/91：**功能全通,布局糙**（用户实评「太糙」——精修留 TODO）:
  a. 统计卡数值区渲染不稳（今日日志卡时显时无——todayLogs null 分支样式）
  b. 第 4 卡 flex-wrap 换行（max-width 300 + 4 卡 → 挤）
  c. hero/横幅/卡区间距紧
  d. 搜索胶囊 placeholder「(批次2 接线)」未接线

## 下一段施工队列（按序）
1. **home 精修一轮**（网格化 4 卡/间距/数值兜底样式）——或按用户指示留更强模型统一精修
2. **屏 2-10 粗装**：每屏 = v4 壳 + 复用既有页签数据（MemoryTabBody 同源 API）+ assetOf 素材管线：
   library(记忆库→MemoryHubTab 数据) / recall(召回) / timeline(时间线) / calendar / mindmap /
   external / handoff(交接) / welcome(hero.welcome 图+8 能力卡) / settings(跳经典设置)
3. **明暗双主题**：`useDeepTheme()` 已有（自动跟随宿主）+ assetOf(key,deep) fileDark —— v4 token 加
   `[data-dam-skin-v4-root][data-deep='1']` 暗色覆盖 + 素材 deep 传参
4. **v4 根高度锚定视口**（滚动假象,低优先——page flex 修复后未见复发）
5. **批次4 终验**：12 卷 §十 + 115 §5 + 112 十二项 + 四实验 → 116 §6 回执

## 关键位置速查
- v4 块：client.js ≈7596-7830（dam-skin:begin/end 标记对）；分支在 MemoryPageView classicNode 之后
- 既有素材管线：`skinAssetUrl(key,deep)`@6865 / SkinHero / SkinImg / SkinBackdrop / useDeepTheme@6985
- 既有数据端点：API.state(greeting/autoStats/todayEntries/ws) / API.workspaces / API.memoryHub(条目+kind)
- 纪律：不 commit/push；经典档除「新款」按钮外逐字节不动；每次编辑后 node --check+EOL+扫描器+r15+回归

## 精修轮 2026-09-27 深夜：welcome/settings 可视化重做 + TOUR_STEPS 上移修复（真机全过）

### 用户指令
「先把这个前端给我接上去。不要照搬，要做可视化，照着设置页面和欢迎向导的页面来做。
这个不是首次启动自动弹出的（首启自动弹的保留）。设置页面的东西和真正的设置页面要做到同步，
只不过用更多可视化的形式做表现，参考设置页预览图（10-settings）和理想化 demo 图（02-welcome）。」

### 代码改动（lib/client.js 949,923B / sha16 241A14D6E83A33E1，备份 client.js.r42-924047-AE9288B1.js）
1. **DamSkinV4Welcome 重做**（概念图02）：4 页 stepper（了解能力/基础配置/个性化设置/完成）+ 蓝色英雄横幅
   （你好👋+3 chips）+ SkinHero 真图 + 核心能力 6 卡真开关（associativeMemoryEnabled/injectEnabled/
   autoConsolidate/memoryHubEnabled/consolidateScheduleEnabled/handoffEnabled，def 与经典档 checked 语义一致）
   + TOUR_STEPS 按 [0,2][2,3][5,3][8,99] 分页渲染（含 boolOn/boolOff 数组键与 mode 键特殊处理）
   + footer 跳过引导(→home)/n·4/下一步。**不是首启自动弹**——首启向导原样保留。
2. **DamSkinV4Settings 重做**（概念图10）：三列卡（主动召回/自动沉淀/外部与排除 | 技能固化/定时任务/交接账本
   | 记忆引擎/数据规模/记忆卫生/quote），**控件全部映射真实 config 键**：
   - 写 = saveConfigPatch 唯一出口（开关/分段/下拉即时写，number/time 失焦或 Enter 提交+夹紧）
   - 读 = configOf 解包 + refreshSem（activationEmitMode 走 semanticEmit 端点，与经典档 :9529 同路径，不走 config）
   - 顶栏同步说明 + ⟳ 重新读取；概念图无后端对应物的控件不造假（存储环图→真实数据规模卡=API.state/workspaces 同源）
3. **★TOUR_STEPS 上移修复（真机实锤）**：原定义+暴露在 DialogHost `if (!dialogState) return null`（:8698）之后
   ⇒ v4 模式无弹窗早退 ⇒ 全局永不赋值 ⇒ v4 welcome 第2/3页空白。整体上移到早退之前（定义只依赖模块级
   locale，经典档行为零改动）。
4. **★--skin-space-3/4/5 补定义**：此前 10+ 条规则引用但从未定义（gap/padding 静默失效），token 行补齐。
5. CSS +37 规则（全部 --skin-* token/color-mix，零裸 hex）；屏分发给 welcome 传 onNav。

### 静态验收
scanner exit0 / r15 64:0 / r28 35:0 / 全量回归 224:0 / SYN_OK / lone-LF 0 / CRLF 保持

### 真机验收（computer-use 截图，全部 L1 实证）
- welcome 4 页：stepper 高亮推进 + 横幅 + 6 能力卡真开关 + TOUR_STEPS 步骤卡（第2页修复后正文完整）+ 一切就绪
- settings 三列：全部卡片渲染；真实值（生效档位 C3·Python、今日日志 92、工作区 8、09:30/10:00、checklist 档）
- **落盘往返**：翻「自动唤回」→ ⟳ 重新读取仍为关 → 翻回 → ⟳ 读回仍为开（saveConfigPatch 真写盘实证）
- **经典档对拍**：返回经典皮肤 → 深色 14 分区 + 92 条日志时间线原样（零改动红线守住）

### 遗留糙点（精修轮后续）
1. settings 屏窄卡里「唤回方式」分段按钮竖排换行（视觉可接受，可优化 min-width）
2. settings 屏侧栏「返回经典皮肤」按钮被挤出可视区（welcome 屏正常；AX 可达但不可见——疑似侧栏高度分配）
3. 7 个 hosted 屏（library/recall/...）仍是经典内容套 v4 壳的粗装态
4. 暗色主题（v4 token dark 覆盖）未做
5. 首页 4 卡网格化等糙点见上文批次2 清单
