/**
 * R14 验收：看板「全部成员」（14a 成员聚合 / 14b 筛选联动）。
 *   真 import lib/wb-sidecar.js ⇒ 真调用 buildMemberListPre / filterCardsPre ⇒ 可复算物理量 + 负路径。
 * ★权威：70 卷 L95（14a 成员聚合 / 14b 筛选联动）· 44 卷 L65（两个筛选下拉「全部成员」/「全部泳道」）
 *        · 48 卷 L69（胶囊文字「全部成员」13px #9AA0A6 + ▾）· fe02 屏②（data-dam-team-member-filter）。
 * ★判据（70 卷）：成员列表准确；单成员筛选生效。
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
console.log('=== R14 全部成员（70 卷 L95 · 44 卷 L65 · fe02 屏②）===')
const { buildMemberListPre, filterCardsPre } = sb
ok(typeof buildMemberListPre === 'function', '① buildMemberListPre 是函数（真导出）')
ok(typeof filterCardsPre === 'function', '② filterCardsPre 是函数（真导出）')

/* ---- 造数据 ---- */
const mk = (member, mtime) => ({ id: 'c' + member + mtime, title: 't', section: 's', kind: 'ledger', member, mtime: mtime || 1, source: 'x.md', chars: 1, bullets: 0, anchored: false, criteria: 'unknown', tags: [] })
const cards = [mk('甲', 10), mk('甲', 20), mk('乙', 30), mk('乙', 40), mk('丙', 50), { id: 'n1', title: 't', section: 's', kind: 'ledger', mtime: 5 }]
const r = buildMemberListPre(cards)

/* ---- 14a 成员聚合 ---- */
ok(r.members.length === 3, '③ 成员列表 3 人（甲/乙/丙，实测 ' + r.members.length + '）')
// ★④ 改为**排序不变量**（由 r.members 自身逐对检查），不写死具体次序 ——
//   中文名次由 UTF-16 码元序决定（乙 U+4E59 < 甲 U+7532），凭直觉猜「甲在前」必错（第 6 次教训）。
const CMP = (a, b) => (b.count - a.count) || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0))
const expectedOrder = r.members.slice().sort(CMP).map((m) => m.name)
const orderOk = r.members.every((m, i, arr) => i === 0 || CMP(arr[i - 1], m) <= 0)
ok(orderOk && r.members.map((m) => m.name).join(',') === expectedOrder.join(','), '④ ★排序不变量成立：count 降序 + 同 count 按 name 码元升序（实测 ' + r.members.map((m) => m.name + ':' + m.count).join(' ') + '）')
/* ---- ★守恒（对标 R13 计数守恒）---- */
ok(r.assigned + r.unassigned === r.total, '⑤ ★计数守恒：assigned(' + r.assigned + ') + unassigned(' + r.unassigned + ') === total(' + r.total + ')')
ok(r.assigned === 5 && r.unassigned === 1, '⑥ 5 张有成员 / 1 张无成员（实测 ' + r.assigned + '/' + r.unassigned + '）')
ok(r.members[0].count === 2 && r.members[2].count === 1, '⑦ 计数准确（甲2 乙2 丙1）')
// ★⑧ 由输入数据自身派生：每个成员的 lastMtime 必须等于「归属该成员的卡」的 mtime 最大值
const expLast = {}
for (const c of cards) { const m = c && c.member; if (!m) continue; expLast[m] = Math.max(expLast[m] || 0, Number(c.mtime) || 0) }
const lastOk = r.members.every((m) => m.lastMtime === expLast[m.name])
ok(lastOk, '⑧ ★每成员 lastMtime = 其自身卡的最大 mtime（由数据派生；' + r.members.map((m) => m.name + '=' + m.lastMtime).join(' ') + '）')
ok(r.hasActorData === true, '⑨ hasActorData = true')
const lim = buildMemberListPre(cards, { limit: 2 })
ok(lim.members.length === 2 && lim.total === 6 && lim.assigned === 5, '⑩ limit 只截列表，total/assigned 不变（实测 ' + lim.members.length + '）')

/* ---- ⑪ ★个人版口径（44 卷 §二）---- */
const personal = buildMemberListPre([{ id: 'a', mtime: 1 }, { id: 'b', mtime: 2 }])
ok(personal.members.length === 0 && personal.hasActorData === false && personal.unassigned === 2, '⑪ ★个人版（无 member 字段）⇒ members=[] 且 hasActorData=false（不是「一个叫未知的成员」）')
ok(personal.assigned + personal.unassigned === personal.total, '⑫ 个人版仍守恒')

/* ---- ⑬ 别名：actor / author 亦被接受 ---- */
const alias = buildMemberListPre([{ id: 'a', actor: '丁' }, { id: 'b', author: '戊' }, { id: 'c', member: { name: '己' } }])
ok(alias.members.length === 3 && alias.assigned === 3, '⑬ ★member/actor/author 三字段任一皆认（含对象形状 {name}，实测 ' + alias.members.length + '）')

/* ---- 14b 筛选联动 ---- */
const f1 = filterCardsPre(cards, { actor: '甲' })
ok(f1.matched === 2 && f1.dropped === 4, '⑭ ★单成员筛选生效：甲 ⇒ 命中 2 / 剔除 4（实测 ' + f1.matched + '/' + f1.dropped + '）')
ok(f1.matched + f1.dropped === f1.total, '⑮ ★筛选守恒：matched + dropped === total')
ok(f1.cards.every((c) => c.member === '甲'), '⑯ 筛后每张都属「甲」')
const f0 = filterCardsPre(cards, { actor: '' })
ok(f0.cards.length === 6 && f0.dropped === 0 && f0.actor === '', '⑰ ★actor 空 ⇒ 不筛选（全量 6，等价「全部成员」）')
const fu = filterCardsPre(cards, {})
ok(fu.cards.length === 6, '⑱ 不给 actor（缺省）⇒ 不筛选')
const fn = filterCardsPre(cards, { actor: '没人' })
ok(fn.matched === 0 && fn.dropped === 6, '⑲ 不存在的成员 ⇒ 命中 0（不是静默返回全量）')
ok(filterCardsPre(cards, { actor: '甲' }).cards.length + filterCardsPre(cards, { actor: '乙' }).cards.length + filterCardsPre(cards, { actor: '丙' }).cards.length === 5, '⑳ ★各成员命中数之和 = assigned（5）—— 不漏不重')

/* ---- ㉑ 与泳道筛选正交（70 卷 R14「联动」）---- */
const laneCards = cards.map((c, i) => Object.assign({}, c, { section: i % 2 ? '进度与下一步' : '目标' }))
const byActor = filterCardsPre(laneCards, { actor: '甲' })
const thenByLane = byActor.cards.filter((c) => c.section === '目标')
ok(byActor.matched === 2 && thenByLane.length === 1, '㉑ ★成员筛选后仍可叠泳道条件（正交；实测 ' + byActor.matched + ' → ' + thenByLane.length + '）')

/* ---- ㉒ 边界与负路径 ---- */
const e = buildMemberListPre([])
ok(e.members.length === 0 && e.total === 0 && e.assigned === 0 && e.unassigned === 0 && e.hasActorData === false, '㉒ ★空态：全 0 且不崩')
let threw = 0
for (const b of [null, undefined, 0, 'x', {}, [null], [{}], [1], { a: 1 }]) { try { buildMemberListPre(b); filterCardsPre(b, { actor: '甲' }) } catch (err) { threw++ } }
ok(threw === 0, '㉓ 9 种畸形入参不抛（实测 ' + threw + '）')
ok(buildMemberListPre(cards, null).total === 6, '㉔ opts=null 不抛')
ok(filterCardsPre(cards, null).cards.length === 6, '㉕ filter opts=null 不抛')
ok(buildMemberListPre(cards, { limit: -1 }).members.length === 3, '㉖ limit 负数 ⇒ 不截断（实测 ' + buildMemberListPre(cards, { limit: -1 }).members.length + '）')
const ws = buildMemberListPre([{ id: 'a', member: '  甲  ' }, { id: 'b', member: '甲' }])
ok(ws.members.length === 1 && ws.members[0].count === 2, '㉗ ★成员名两端空白归一（「  甲  」与「甲」算同一人）')

/* ---- ㉘ 宿主接线（真源码断言，仅作守卫）---- */
ok(IDX.indexOf('const memberRes = buildMemberListPre(boardCards, { limit: 200 })') >= 0, '㉘ ★宿主真接线：buildMemberListPre(boardCards, …)')
ok(IDX.indexOf('const filterRes = filterCardsPre(boardCards, { actor: actorWant })') >= 0, '㉙ ★宿主真接线：filterCardsPre(boardCards, …)')
ok(IDX.indexOf('kb.memberList = memberRes.members') >= 0, '㉚ ★memberList 顶层键在场（fe02 屏②消费点）')
ok(IDX.indexOf('kb.stats.members = { total: memberRes.total') >= 0, '㉛ stats.members 审计量在场')
ok(IDX.indexOf("url.searchParams.get('actor')") >= 0, '㉜ ★14b 路由真透传 actor')
ok(IDX.indexOf('kb.stats.fold = { foldDays: foldRes.foldDays') >= 0, '㉝ R13 stats.fold 未破')
ok(IDX.indexOf('kb.stats.cards4 = stat4.cards') >= 0, '㉞ R12 cards4 未破')
ok(IDX.indexOf('const wantArchive = (opts && opts.includeArchive === true)') >= 0, '㉟ R11c 归档 opt-in 未破')
ok(IDX.indexOf("boardMode: 'graph', cardSource: 'section'") >= 0, '㊱ L509 载荷契约未破')

/* ---- ㊲ 守卫反向验证：真删 buildMemberListPre 定义（去 export）---- */
const A1 = 'export function buildMemberListPre(cards, opts = {}) {'
const A2 = 'export function filterCardsPre(cards, opts = {}) {'
ok(SRC.split(A1).length - 1 === 1, '㊲ 被删锚串①恰命中 1 次')
ok(SRC.split(A2).length - 1 === 1, '㊳ 被删锚串②恰命中 1 次')
ok(Object.keys(sb).indexOf('buildMemberListPre') >= 0 && Object.keys(sb).indexOf('filterCardsPre') >= 0, '㊴ 导出集合含二者（导出数 ' + Object.keys(sb).length + '）')
console.log('')
console.log('[r14] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)