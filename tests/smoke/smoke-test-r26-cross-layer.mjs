/** R26 · 跨层对账审计：includeArchive 缺口收官（真 import + 真调用 + 负路径）。 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { foldCardsPre, buildByTagPre } from 'file:///D:/dsh-auto-memory/lib/wb-sidecar.js'
const SRC = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')
const IX = readFileSync('D:/dsh-auto-memory/lib/index.js', 'utf8')
let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')
const cnt = (s, x) => s.split(x).length - 1

/* ── A. ★★审计的方法本身：宿主每个 query 参数都要有前端消费者 ── */
const PARAMS = [...new Set([...IX.matchAll(/searchParams\.get\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))]
ok(PARAMS.length >= 10, 'A1 宿主接参 ≥10 种（实测 ' + PARAMS.length + '）')
// ★★前端消费判定必须容忍**带后缀写法**（如 API.recallStats + '?reset=1'）—— 首轮审计用整串匹配漏检了 reset。
const consumed = (name) => SRC.indexOf("'" + name + "'") >= 0 || SRC.indexOf('"' + name + '"') >= 0 || SRC.indexOf(name + '=') >= 0 || new RegExp('\\b' + name + '\\s*[:\)]').test(SRC)
const missing = PARAMS.filter((x) => !consumed(x))
eq(missing.length, 0, 'A2 ★★零「宿主有参数、前端无消费者」（缺：' + (missing.join(',') || '无') + '）')
ok(PARAMS.includes('includeArchive'), 'A3 includeArchive 确在宿主参数表内')
ok(PARAMS.includes('foldDays'), 'A4 foldDays 确在宿主参数表内')

/* ── B. 宿主侧能力（★真 import 真调用，证明两参数语义正交） ── */
const D = 86400000, now = Date.now()
const cards = [0, 1, 2, 20, 30].map((d, i) => ({ id: 'c' + i, title: 't' + i, mtime: now - d * D, kind: i === 4 ? 'archive' : 'state' }))
const r7 = foldCardsPre(cards, { now, foldDays: 7 })
const r0 = foldCardsPre(cards, { now, foldDays: 0 })
eq(r7.visible.some((c) => c.kind === 'archive'), false, 'B1 ★★★负路径：7 天态归档卡**不可见**（46 卷 §四 B2 症状复现）')
eq(r0.visible.some((c) => c.kind === 'archive'), true, 'B2 ★★0 天态归档卡可见')
ok(r7.hasMore === true && r0.hasMore === false, 'B3 ★两参数语义正交：foldDays 管折叠、includeArchive 管读盘范围')
ok(cnt(IX, "searchParams.get('includeArchive')") === 1, 'B4 宿主路由接 includeArchive 恰 1 处')
ok(IX.includes("String((this.config || {}).boardArchive || '') === 'on'"), 'B5 宿主保留 boardArchive 配置回退（解耦，未被绕过）')
ok(IX.includes('includeArchive: true })') || IX.includes('{ includeArchive: true }'), 'B6 宿主内部展开全文路径仍恒传 true（不受本改动影响）')

/* ── C. 前端接线（R26 补的两参数同传） ── */
eq(cnt(SRC, 'foldDays: foldOpen.days'), 1, 'C1 ★foldDays 真传恰 1 处（R25 成果不降级）')
// ★R38：KanbanBoardRail 展开时**另发一次** foldDays:0 的取数（折叠态上提到本组件）——语义仍为「真带 foldDays」，故 C1 保持不变。
eq(cnt(SRC, 'foldDays: 0'), 1, 'C1b ★折叠条展开态真传 foldDays:0（days=0 ⇒ 不折叠）')
eq(cnt(SRC, 'includeArchive: foldOpen.days === 0 ?'), 1, 'C2 ★★includeArchive 真传恰 1 处（R26 新接线）')
eq(cnt(SRC, "includeArchive: '1'"), 1, 'C2b ★R38 展开态 includeArchive 真传（两条语义同时放开）')
ok(/includeArchive: foldOpen\.days === 0 \? '1' : '0'/.test(SRC), 'C3 ★条件正确：展开态传 1、折叠态传 0')
// ★修正（本轮自查）：原写死 `=== 2` 是「凭直觉写死期望值」第 7 次 —— 实测 3 处（rail / 画布 / L5613）。
//   改为**由源码派生**：断言「恰好 1 处带 foldDays」，其余不带（画布与另一处不受扩散）。
// ★R38 口径同步：3 → 4。新增的第 4 处是 KanbanBoardRail 展开时带 foldDays:0 + includeArchive:'1' 的取数
//   （R26 定的两条语义此前只在 KanbanView 里传过；rail 这条是 R25/R26 缺口在**面板承载面**上的补齐）。
//   计数锁是**守卫**不是功能证据；被守语义「取数点集合已知且不变为意外」未变，故同步新值。
eq(cnt(SRC, 'apiGet(API.kanbanBoard'), 4, 'C4a（守卫）kanbanBoard 取数点 4 处（R38 新增 rail 展开取数）')
eq(SRC.split('apiGet(API.kanbanBoard').length - 1, 4, 'C4b 同源复核')
ok(!/includeArchive/.test(SRC.slice(SRC.indexOf('function WhiteboardGraphView'), SRC.indexOf('function WhiteboardGraphView') + 3000)), 'C5 ★画布视图不传 includeArchive（口径不被扩散）')

/* ── D. 与 46 卷 §四 B2 的判据对拍 ── */
const V46 = readFileSync('D:/dsh-auto-memory/docs/teamwork-impl/46-看板排布优化prompt.md', 'utf8')
ok(/includeArchive/.test(V46) && /结构性死泳道|恒空/.test(V46), 'D1 ★权威卷 46 §四 B2 确以 includeArchive 定性该缺陷')

/* ── E. 守恒 ── */
eq((SRC.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length, 2, 'E1 计数锁不变')
ok(cnt(SRC, '\n') === cnt(SRC, '\r\n'), 'E2 纯 CRLF')
// ★修正（本轮自查）：原 E3 是 `eq(cnt(IX,X), cnt(IX,X))` —— **自比恒真哨兵**，等于没测。
//   改为真断言：宿主**本轮零改动**（sha16 与基线一致）+ 路由数守恒。
// ★基线演进（2026-09-28，用户点名「先加在旧版上」）：R25→R44 唯一有意变更 = index.js DEFAULT_CONFIG
//   补 `teamShowMemberBadges: true`（4 行）——该键此前只有设置控件、不在白名单，写了被 /config 丢弃
//   （死开关，P0-7 同类缺口）。守卫语义保留：除本条外 index.js 任何其他改动仍会被本锁抓住。
// ★2026-09-28 基线演进 R44→R46：新增 skin-library-fetch 路由（用户第 1 大点·皮肤库机制，见 HANDBOOK §5.1）。
//   语义保留：除本条与 E4 计数外，index.js 任何其他改动仍会被本锁抓住。
// ★2026-09-28 基线演进 R47→R48：修「一键接续漂到别的工作区」——handoffPanelData 的刷新目标不再跨工作区
//   磁盘回退（原 recentSessionIdFallback 会返回别的工作区的会话，致新会话落到错误 Workspace）。
//   语义保留：除本条与 E4 计数外，index.js 任何其他改动仍会被本锁抓住。
eq(createHash('sha256').update(IX).digest('hex').slice(0, 16).toUpperCase(), '378AF75BC5C6EA94', 'E3 ★宿主 lib/index.js 基线守恒（sha16 = R49 基线；R48→R49 放行 = 修 issue #144 两项：subAgentOptions 回填 provider（跨 provider 子代理 UNKNOWN_MODEL）+ 设置文件读取改走活布局定位器 profiles/<p>/cordis.patch.yml（0.1.7 迁移后两处静默降级），理由见上）')
// ★2026-09-28 计数演进：67→68（新增 skin-library-fetch，见 E3 同批）。语义保留：仍锁路由数不漂移。
eq(cnt(IX, "path: API[") + cnt(IX, 'path: API.'), 68, 'E4 ★路由数守恒 = 68（2026-09-28 皮肤库路由 +1；其余零新增）')
console.log('lib/client.js ' + Buffer.byteLength(SRC, 'utf8') + 'B / CRLF ' + (SRC.match(/\r\n/g) || []).length + ' / sha16 ' + createHash('sha256').update(SRC).digest('hex').slice(0, 16).toUpperCase())
console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)
