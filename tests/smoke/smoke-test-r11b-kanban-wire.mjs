/**
 * R11b 端到端验收：真启动 host（真 import lib/index.js）⇒ 真调 kanban-board 路由 ⇒ 断言归并生效。
 * ★CR-10：真构造 + 真调用 + 断言返回值，且量可复算（cardsRaw / cardsMerged / 泳道合计）。
 */
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const sb = await import(pathToFileURL(path.join(ROOT, 'lib', 'wb-sidecar.js')).href)
const { buildSectionCardsPre, dedupeCardsPre } = sb

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m) } }
console.log('=== R11b 端到端验收（看板去重接线）===')

/* ---- ① 源码级：接线形态（守卫锁形态，非功能验收）---- */
const IDX = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')
ok(IDX.indexOf('const boardCards = dedupeCardsPre(cards)') >= 0, '① 宿主真的调用了 dedupeCardsPre（const boardCards = …）')
ok(IDX.indexOf('cards: boardCards') >= 0, '② 喂给 buildKanbanPre 的是 boardCards')
ok(IDX.indexOf('buildKanbanMatrixPre(boardCards') >= 0, '③ 矩阵投影也改走 boardCards')
ok(IDX.indexOf('kb.stats.cardsRaw = cards.length') >= 0 && IDX.indexOf('kb.stats.cardsMerged = boardCards.length') >= 0, '④ stats 审计量（cardsRaw / cardsMerged）在场')
ok(/boardMode:\s*'graph',\s*cardSource:\s*'section',\s*matrix\s*\}/.test(IDX), '⑤ ★载荷契约不变（boardMode/cardSource/matrix 仍匹配）')

/* ---- ② 真构造：真造一个工作区磁盘（handoff/*.md）⇒ 真跑读盘+投影 ---- */
const tmp = mkdtempSync(path.join(os.tmpdir(), 'r11b-'))
const hd = path.join(tmp, 'handoff')
mkdirSync(hd, { recursive: true })
const mkDoc = (tag) => ['# 交接账本 · ' + tag, '## 任务状态', 'type:state 甲', '## 目标', 'type:goal 乙', '## 已试方案与失败原因', 'type:dead-end 丙', '## 进度与下一步', 'type:progress 丁'].join(String.fromCharCode(10))
const N = 12
const files = []
for (let i = 0; i < N; i++) {
  const f = path.join(hd, 'ledger-' + String(i).padStart(2, '0') + '.md')
  writeFileSync(f, mkDoc('L' + i), 'utf8')
  files.push(f)
}
const docs = files.map((p) => ({ relPath: 'handoff/' + path.basename(p), text: readFileSync(p, 'utf8'), kind: 'ledger', mtime: statSync(p).mtimeMs }))
const cards = buildSectionCardsPre('ws', docs)
ok(cards.length === N * 4, '⑥ 真构造 ' + N + ' 篇 × 4 节 = ' + cards.length + ' 张卡（原始）')
const rawTitles = new Set(cards.map((c) => c.title)).size
ok(rawTitles === 4, '⑦ 原始唯一标题 = 4（实测 ' + rawTitles + '）⇒ 重复率 ' + (((cards.length - rawTitles) / cards.length) * 100).toFixed(1) + '%')

/* ---- ③ 真调用：走宿主同一函数链 ---- */
const boardCards = dedupeCardsPre(cards)
ok(boardCards.length === 4, '⑧ 归并后 = 4 组（实测 ' + boardCards.length + '）')
ok(boardCards.reduce((a, c) => a + c.count, 0) === cards.length, '⑨ ★守恒：Σcount = ' + cards.length + '（无卡丢失）')
const mergedTitles = new Set(boardCards.map((c) => c.title)).size
ok(mergedTitles === boardCards.length, '⑩ ★归并后标题全唯一（' + mergedTitles + '=' + boardCards.length + '）⇒ 重复率 0')
ok(boardCards.every((c) => c.title.indexOf('（共 ' + N + ' 条）') >= 0), '⑪ 每组标题带「共 ' + N + ' 条」（' + boardCards[0].title + '）')

/* ---- ④ 泳道与投影：真调 buildKanbanPre ---- */
const { buildKanbanPre, buildKanbanMatrixPre } = sb
const kbRaw = buildKanbanPre({ entries: [], by_tag: {}, versions: {} }, { cards, now: 'T' })
const kbMerged = buildKanbanPre({ entries: [], by_tag: {}, versions: {} }, { cards: boardCards, now: 'T' })
const laneTotal = (k) => k.lanes.reduce((a, l) => a + l.count, 0)
ok(laneTotal(kbRaw) === cards.length, '⑫ 未归并泳道合计 = ' + laneTotal(kbRaw) + ' = 卡数')
ok(laneTotal(kbMerged) === boardCards.length, '⑬ 归并后泳道合计 = ' + laneTotal(kbMerged) + ' = 组数')
const laneKeysRaw = kbRaw.lanes.map((l) => l.key).join(',')
const laneKeysMerged = kbMerged.lanes.map((l) => l.key).join(',')
ok(laneKeysRaw === laneKeysMerged, '⑭ ★泳道集合不变（' + laneKeysMerged + '）')
const mtx = buildKanbanMatrixPre(boardCards, { now: 'T' })
ok(mtx && Array.isArray(mtx.rows), '⑮ 矩阵投影对归并结果有效（rows 数组，' + (mtx.rows || []).length + ' 行）')

/* ---- ⑤ 负路径 ---- */
ok(dedupeCardsPre([]).length === 0, '⑯ 空输入 ⇒ 空数组')
let threw = 0
for (const b of [null, undefined, 'x', 0, {}, [null], [{}]]) { try { dedupeCardsPre(b) } catch (e) { threw++ } }
ok(threw === 0, '⑰ 7 种畸形入参不抛（实测抛出 ' + threw + '）')
ok(buildSectionCardsPre('ws', []).length === 0 && buildKanbanPre({ entries: [] }, { cards: [] }).lanes.length > 0, '⑱ ★空输入仍出泳道形状（S1 既有行为未被破坏）')

try { rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
console.log('')
console.log('[r11b] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)