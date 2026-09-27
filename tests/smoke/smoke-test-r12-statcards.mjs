/**
 * R12 验收：看板四张统计卡（48 卷 L78–L89）+ 12b 空态。
 *   真 import lib/wb-sidecar.js ⇒ 真调用 buildStatCardsPre ⇒ 断言可复算物理量 + 负路径。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SB = path.join(ROOT, 'lib', 'wb-sidecar.js')
const IDX = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')
const SRC = readFileSync(SB, 'utf8')
const sb = await import(pathToFileURL(SB).href)
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m) } }
console.log('=== R12 四张统计卡（48 卷 L78–L89）===')
const { buildStatCardsPre } = sb
ok(typeof buildStatCardsPre === 'function', '① buildStatCardsPre 是函数（真导出）')

/* ---- ② 四张卡的 key/label/unit 与 48 卷逐字一致 ---- */
const NOW = new Date(2026, 8, 27, 12, 0, 0).getTime()  // 2026-09-27 周日 12:00 本地
const D = 86400000
const mk = (mtime, source) => ({ id: 'x', title: 't', section: 's', kind: 'ledger', mtime, source, chars: 1, bullets: 0, anchored: false, criteria: 'unknown', tags: [] })
const cards = [
  mk(NOW - 3600000, 'handoff/a.md'),        // 今天
  mk(NOW - 2 * 3600000, 'handoff/a.md'),    // 今天（同源）
  mk(NOW - 3 * D, 'handoff/b.md'),          // 4 天前（本周）
  mk(NOW - 30 * D, 'handoff/c.md'),         // 30 天前（非本周）
]
const r = buildStatCardsPre(cards, { now: NOW, archiveCount: 292 })
ok(Array.isArray(r.cards) && r.cards.length === 4, '② 恰 4 张卡（实测 ' + r.cards.length + '）')
ok(r.cards.map((c) => c.label).join(',') === '今日活动,本周交接,协作成员,历史归档', '③ ★标签逐字 = 48 卷（' + r.cards.map((c) => c.label).join('/') + '）')
ok(r.cards.map((c) => c.unit).join(',') === '条,次,人,篇', '④ ★单位逐字 = 48 卷（' + r.cards.map((c) => c.unit).join('/') + '）')
ok(r.cards.map((c) => c.key).join(',') === 'today,week,members,archived', '⑤ key 顺序稳定')

/* ---- ⑥ 四类值可复算 ---- */
ok(r.values.today === 2, '⑥ 今日活动 = 今天 mtime 卡数 2（实测 ' + r.values.today + '）')
ok(r.values.weekDocs === 2, '⑦ ★本周交接 = 本周**不同 source 文档数**（a+b=2，实测 ' + r.values.weekDocs + '）')
ok(r.values.members === 0, '⑧ ★协作成员 = 0（个人版无 member 字段，44 卷 §二）')
ok(r.values.archived === 292, '⑨ 历史归档 = archiveCount 透传（292，实测 ' + r.values.archived + '）')
ok(r.cards[1].value === r.values.weekDocs, '⑩ cards 与 values 一致')

/* ---- ⑪ 边界：周起点 = 周一 ---- */
const MON = new Date(2026, 8, 21, 0, 0, 0).getTime()  // 2026-09-21 周一
const rw = buildStatCardsPre([mk(MON + 3600000, 'x.md'), mk(MON - 3600000, 'y.md')], { now: MON + 2 * 3600000 })
ok(rw.values.weekDocs === 1, '⑪ ★周起点正确（周一同天算本周、周日不算；实测 ' + rw.values.weekDocs + '）')

/* ---- ⑫ 负路径：空态与畸形入参 ---- */
const e = buildStatCardsPre([], { now: NOW })
ok(e.cards.length === 4 && e.values.today === 0 && e.values.weekDocs === 0 && e.values.members === 0 && e.values.archived === 0, '⑫ ★12b 空态：四值全 0 且不崩')
let threw = 0
for (const b of [null, undefined, 0, 'x', {}, [null], [{}], [1, 2], { a: 1 }]) { try { buildStatCardsPre(b, { now: NOW }) } catch (err) { threw++ } }
ok(threw === 0, '⑬ 9 种畸形入参不抛（实测 ' + threw + '）')
const rn = buildStatCardsPre(cards, { now: 'not-a-date' })
ok(rn.cards.length === 4, '⑭ 无效 now 不崩（回落 0）')
ok(buildStatCardsPre(cards, { now: NOW, archiveCount: -5 }).values.archived === 0, '⑮ archiveCount 负数 ⇒ 0（不出现负篇数）')

/* ---- ⑯ 宿主接线（真源码断言，仅作守卫） ---- */
ok(IDX.indexOf('buildStatCardsPre(boardCards, { now:') >= 0, '⑯ ★宿主真接线：stats.cards4 = buildStatCardsPre(boardCards, ...)')
ok(IDX.indexOf('kb.stats.cards4 = stat4.cards') >= 0, '⑰ stats.cards4 赋值在场')
ok(IDX.indexOf("readdir(path.join(projectDir, 'handoff', 'archive'))") >= 0, '⑱ ★归档篇数走 readdir（不读内容，守拍板 C）')
ok(IDX.indexOf('kb.stats.archived = { included: wantArchive, count: archDocs }') >= 0, '⑲ R11c 的 stats.archived 未被破坏')

/* ---- ⑳ 守卫反向验证：真删 buildStatCardsPre 定义（去 export） ---- */
const ANCHOR = 'export function buildStatCardsPre(cards, opts = {}) {'
ok(SRC.split(ANCHOR).length - 1 === 1, '⑳ 被删锚串恰命中 1 次')
ok(Object.keys(sb).indexOf('buildStatCardsPre') >= 0, '㉑ 导出集合含 buildStatCardsPre（导出数 ' + Object.keys(sb).length + '）')
console.log('')
console.log('[r12] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)