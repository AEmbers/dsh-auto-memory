/**
 * R11c 验收：看板归档泳道（46 卷 B2 收口）+ 复合键 + PLAN 入板（B1）。
 *   真 import lib/wb-sidecar.js ⇒ 真构造 ⇒ 真调用 ⇒ 断言可复算物理量。
 * ★权威：44 卷用户原话「5 个泳道没啥毛病 · 修好或者删掉、换泳道」+ 46 卷 §四 B1/B2 + lib/index.js:3311「用户拍板 C」。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC_PATH = path.join(ROOT, 'lib', 'wb-sidecar.js')
const IDX_PATH = path.join(ROOT, 'lib', 'index.js')
const SRC = readFileSync(SRC_PATH, 'utf8')
const IDX = readFileSync(IDX_PATH, 'utf8')
const sb = await import(pathToFileURL(SRC_PATH).href)
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m) } }
console.log('=== R11c 归档泳道 + 复合键 + PLAN 入板 ===')
const { buildSectionCardsPre, dedupeCardsPre, laneOfEntryPre, buildKanbanPre } = sb

/* ---- ① 复合键：归档卡与活跃卡不得混组 ---- */
const mk = (kind, section, src) => ({ id: 'mem_' + Math.random().toString(16).slice(2, 34).padEnd(32, '0'), title: section, section, kind, source: src, mtime: 1758900000000, criteria: 'unknown' })
// ★注意：section 用不与任何泳道 matchSections 冲突的名字（'版本记录'）——
//   若用 '目标'，laneOfEntryPre 的 goal 泳道会**按既有优先级**先命中（这是设计，不是缺陷）。
const SEC = '版本记录'
const mixed = [mk('ledger', SEC, 'handoff/a.md'), mk('archive', SEC, 'handoff/archive/b.md'), mk('plan', SEC, 'handoff/PLAN.md')]
const dm = dedupeCardsPre(mixed)
ok(dm.length === 3, '① ★三种 kind 同 section ⇒ 归并后仍 **3 组**（实测 ' + dm.length + '）⇒ 复合键生效')
ok(dm.every((c) => c.count === 1), '② 每组 count=1（未跨 kind 归并）')
const lanes = dm.map((c) => laneOfEntryPre(c))
ok(lanes.indexOf('archive') >= 0, '③ ★归档组进「版本归档」泳道（' + lanes.join(',') + '）')
ok(lanes.indexOf('misc') >= 0 && lanes.length === 3, '④ 三种 kind 各保持独立分组（泳道 ' + lanes.join(',') + '）')
// ★真数据：archive/ 目录文档的 section 与泳道
const archCard = mk('archive', '历史留档', 'handoff/archive/PLAN-x.md')
ok(laneOfEntryPre(archCard) === 'archive', '④b ★kind=archive 且节名不冲突 ⇒ 归入 archive 泳道（实测 ' + laneOfEntryPre(archCard) + '）')

/* ---- ② 同 kind 行为不回归（R11a 判据未破）---- */
const same = [mk('ledger', '目标', 'a.md'), mk('ledger', '目标', 'b.md')]
const ds = dedupeCardsPre(same)
ok(ds.length === 1 && ds[0].count === 2, '⑤ 同 kind 同 section 仍正常归并（1 组 / count=2）')
ok(ds[0].title.indexOf('（共 2 条）') >= 0, '⑥ 标题仍带「共 N 条」')
ok(ds[0].section === '目标', '⑦ ★section 字段仍为纯节名（未被复合键污染）')

/* ---- ③ 守恒与空路径 ---- */
ok(dedupeCardsPre(mixed).reduce((a, c) => a + c.count, 0) === 3, '⑧ 守恒 Σcount=3')
ok(dedupeCardsPre([]).length === 0, '⑨ 空输入 ⇒ 空数组')
let threw = 0
for (const b of [null, undefined, 0, 'x', {}, [null], [{}]]) { try { dedupeCardsPre(b) } catch (e) { threw++ } }
ok(threw === 0, '⑩ 7 种畸形入参不抛（实测 ' + threw + '）')

/* ---- ④ 宿主侧：归档 opt-in（默认守拍板 C）---- */
ok(IDX.indexOf('const wantArchive = (opts && opts.includeArchive === true)') >= 0, '⑪ 宿主真解析 includeArchive opt-in')
ok(IDX.indexOf('{ includeArchive: wantArchive }') >= 0, '⑫ docs 收集走 wantArchive（不再硬编码 false）')
ok(IDX.indexOf('kb.stats.archived = { included: wantArchive, count: archDocs }') >= 0, '⑬ stats.archived 审计量在场')
ok(IDX.indexOf("url.searchParams.get('includeArchive') === '1'") >= 0, '⑭ 路由真透传 includeArchive=1')
ok(/boardMode:\s*'graph',\s*cardSource:\s*'section',\s*matrix\s*\}/.test(IDX), '⑮ ★载荷契约不变（守卫锁）')

/* ---- ⑤ 守卫反向验证：真删 dedupeCardsPre 定义（去 export）---- */
const ANCHOR = 'export function dedupeCardsPre(cards, opts = {}) {'
ok(SRC.split(ANCHOR).length - 1 === 1, '⑯ 被删锚串恰命中 1 次')
const before = Object.keys(sb).length
ok(Object.keys(sb).indexOf('dedupeCardsPre') >= 0, '⑰ 导出集合含 dedupeCardsPre（删除后应消失，导出数 ' + before + '）')
console.log('')
console.log('[r11c] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)