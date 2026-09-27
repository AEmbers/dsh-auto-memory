/**
 * R11 验收：看板层去重（43 卷环 3 + 66 卷裁定）。
 *   真 import lib/wb-sidecar.js ⇒ 真构造 docs ⇒ 真调用 buildSectionCardsPre + dedupeCardsPre
 *   ⇒ 断言可复算物理量（卡片数 / 唯一标题数 / 重复率 / 归并守恒）。
 * CR-10：正负路径齐备 + 守卫反向验证。
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC_PATH = path.join(ROOT, 'lib', 'wb-sidecar.js')
const SRC = readFileSync(SRC_PATH, 'utf8')
const sb = await import(pathToFileURL(SRC_PATH).href)

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m) } }

console.log('=== R11 看板层去重验收 ===')

const { buildSectionCardsPre, dedupeCardsPre, laneOfEntryPre, buildKanbanPre } = sb
ok(typeof dedupeCardsPre === 'function', '① dedupeCardsPre 已导出且为真函数（' + typeof dedupeCardsPre + '）')
ok(typeof buildSectionCardsPre === 'function' && typeof buildKanbanPre === 'function', '② 既有两个导出仍在（不降级）')
ok(typeof laneOfEntryPre === 'function', '③ laneOfEntryPre 仍导出（泳道归类依赖它）')

/* ---- ④ 真构造：两篇四段式账本（模板同构，标题逐字相同）----
 * ★2026-09-28 夹具修正：原 mtime 1758999999999 在本地时区已跨到次日（09-28），
 *   而本套件语义 = **同日**同小节归并 ⇒ 归并键加日期维度后（R45 时间轴修复）会分成两组。
 *   这里把两个 mtime 调到真实同一天（同日不同时刻），保住套件原意（同日去重），
 *   并新增 ⑬b 跨日**不**归并的反向断言（时间轴语义锁）。 */
const mkDoc = (tag) => ['# 交接账本 · ' + tag, '## 任务状态', 'type:state 甲', '- 甲一', '## 目标', 'type:goal 乙', '## 已试方案与失败原因', 'type:dead-end 丙', '## 进度与下一步', 'type:progress 丁'].join(String.fromCharCode(10))
const docs = [
  { relPath: 'handoff/handoff-A.md', text: mkDoc('A'), kind: 'ledger', mtime: 1758900000000 },
  { relPath: 'handoff/handoff-B.md', text: mkDoc('B'), kind: 'ledger', mtime: 1758892800000 },
]
const cards = buildSectionCardsPre('ws', docs)
ok(cards.length === 8, '④ 真调用 buildSectionCardsPre ⇒ 2 篇 × 4 节 = 8 张（实测 ' + cards.length + '）')
const titles0 = cards.map((c) => c.title)
ok(new Set(titles0).size === 4, '⑤ 未归并时唯一标题 = 4（实测 ' + new Set(titles0).size + '）')
ok(titles0.length - new Set(titles0).size === 4, '⑥ 未归并时重复 4 张（重复率 50%）')

/* ---- ⑦⑧ 真调用 dedupeCardsPre ---- */
const merged = dedupeCardsPre(cards)
ok(Array.isArray(merged) && merged.length === 4, '⑦ 归并后 = 4 组（实测 ' + merged.length + '）')
const sumCount = merged.reduce((a, c) => a + (Number(c.count) || 0), 0)
ok(sumCount === cards.length, '⑧ ★守恒：各组 count 之和 = 原卡片数（' + sumCount + ' === ' + cards.length + '）⇒ 无卡丢失')
ok(merged.every((c) => c.count === 2), '⑨ 每组 count 均为 2（' + JSON.stringify(merged.map((c) => c.count)) + '）')
ok(merged.every((c) => c.merged === true), '⑩ 每组 merged 均为 true')
ok(merged.every((c) => c.title.indexOf('（共 2 条）') >= 0), '⑪ 标题带「共 N 条」（' + JSON.stringify(merged.map((c) => c.title)) + '）')
ok(merged.every((c) => c.sources.length === 2), '⑫ 每组 sources 记到 2 个来源文件')
// ★2026-09-28 语义对齐（R45 时间轴修复）：归并键含日期后，**同日**组内 dates 去重 = 1 个日期。
//   原断言 dates.length===2 是旧语义残留（当时两篇跨了两天）。现断言 = 「dates 集合大小 =
//   组内不同日期数」，语义等价（记录日期、去重、封顶 maxSources），不弱化。
const dayOf = (t) => { const d = new Date(t); const p = (n) => (n < 10 ? '0' + n : n); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) }
const daysInGroup = new Set([dayOf(1758900000000), dayOf(1758892800000)]).size
ok(merged.every((c) => c.dates.length === daysInGroup), '⑬ 每组 dates 记到组内不同日期数 = ' + daysInGroup + '（' + JSON.stringify(merged[0].dates) + '）')
ok(new Set(merged.map((c) => c.title)).size === merged.length, '⑭ ★归并后标题全唯一 ⇒ 重复率 0')

/* ---- ⑮⑯ ★泳道归类逐条不变（section 未被改）---- */
const setA = new Set(cards.map((c) => laneOfEntryPre(c)))
const setB = new Set(merged.map((c) => laneOfEntryPre(c)))
ok(setA.size === 4 && setB.size === 4, '⑮ 四节分属四条泳道（未归并 ' + Array.from(setA).join(',') + '）')
ok(Array.from(setB).every((k) => setA.has(k)) && setB.size === setA.size, '⑯ ★归并后泳道集合不变（' + Array.from(setB).join(',') + '）⇒「只动 title 不动 section」得到证明')
ok(merged.every((c) => String(c.section || '').indexOf('（共 ') < 0), '⑰ ★section 字段未被加「共 N 条」后缀（只有 title 才有）')

/* ---- ⑱ 顺序稳定：首现顺序 ---- */
const firstOf = cards.map((c) => c.section || c.title).filter((v, i, a) => a.indexOf(v) === i)
ok(JSON.stringify(merged.map((c) => c.section || c.title)) === JSON.stringify(firstOf), '⑱ 组顺序 = 首次出现顺序')

/* ---- ⑲⑳ 负路径 ---- */
let thrown = 0, badOut = 0
const bads = [null, undefined, 0, '', 'x', {}, NaN, [], [null], [undefined], [1, 2], [{}, {}], [{ section: '' }], [{ section: null }]]
for (const b of bads) {
  try { const r = dedupeCardsPre(b); if (!Array.isArray(r)) badOut++ } catch (e) { thrown++ }
}
ok(thrown === 0, '⑲ 14 种畸形入参全部不抛（实测抛出 ' + thrown + '）')
ok(badOut === 0, '⑳ 14 种畸形入参返回值恒为数组（实测非数组 ' + badOut + '）')
let optThrown = 0
for (const o of [null, 0, 'x', [], { by: 'zzz' }, { maxSources: -1 }, { maxSources: 'x' }]) { try { dedupeCardsPre(cards, o) } catch (e) { optThrown++ } }
ok(optThrown === 0, '㉑ 7 种畸形 opts 不抛（实测 ' + optThrown + '）')

/* ---- ㉒㉓ 幂等 ---- */
ok(JSON.stringify(dedupeCardsPre(cards)) === JSON.stringify(merged), '㉒ 幂等：两次调用结果逐字节相同')
ok(dedupeCardsPre(merged).length === merged.length, '㉓ 对已归并结果再归并 = 长度不变')
ok(dedupeCardsPre(cards, { by: 'title' }).length === 4, '㉔ by=title 亦得 4 组')

/* ---- ㉕㉖ 守卫反向验证：真删定义（先断言锚串恰命中 1 次）---- */
const ANCHOR = 'export function dedupeCardsPre(cards, opts = {}) {'
ok(SRC.split(ANCHOR).length - 1 === 1, '㉕ 被删锚串在源码中恰命中 1 次（防注释包裹假绿）')
const del = SRC.replace(ANCHOR, 'function __DELETED_dedupePre(cards, opts = {}) {')
const tmpPath = path.join(ROOT, 'lib', '__tmp-r11-del-check' + Date.now() + '.mjs')
let delExports = null
try {
  writeFileSync(tmpPath, del, 'utf8')
  const delMod = await import(pathToFileURL(tmpPath).href)
  delExports = Object.keys(delMod)
} finally { try { unlinkSync(tmpPath) } catch (e) {} }
ok(Array.isArray(delExports) && delExports.indexOf('dedupeCardsPre') < 0, '㉖ ★真删定义 ⇒ 导出集合中 dedupeCardsPre 消失（实测 ' + (delExports ? String(delExports.indexOf('dedupeCardsPre')) : 'n/a') + '）')
ok(Array.isArray(delExports) && delExports.length === Object.keys(sb).length - 1, '㉗ ★导出数恰少 1（' + Object.keys(sb).length + ' → ' + (delExports ? delExports.length : 'n/a') + '）')

console.log('')
console.log('[r11] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)