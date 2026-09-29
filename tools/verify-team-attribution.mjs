#!/usr/bin/env node
/**
 * verify-team-attribution.mjs — CR-10：真 import + 真构造 + 真调用 + 断言返回值
 * 验 37 卷 §1 三条判据：正路径 / 负路径 / 隔离路径
 */
import { createTeamAttribution } from '../lib/team-attribution.js'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'lib/team-attribution.js')
let PASS = 0
let FAIL = 0
const ok = (m) => { PASS++; console.log('PASS  ' + m) }
const ng = (m) => { FAIL++; console.log('FAIL  ' + m) }
const eq = (a, b, m) => {
  if (a === b) ok(m + '  [' + JSON.stringify(a) + ']')
  else ng(m + '  实得 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b))
}

console.log('== team-attribution 验收 ==')
console.log('src: ' + SRC)

// 0. 文件级
if (existsSync(SRC)) ok('0.1 lib/team-attribution.js 存在'); else ng('0.1 不存在')
const srcText = readFileSync(SRC, 'utf8')
eq(srcText.indexOf('\r\n') > 0, true, '0.2 使用 CRLF')
eq((srcText.match(/(?<!\r)\n/g) || []).length, 0, '0.3 裸 LF = 0')
eq(typeof createTeamAttribution, 'function', '0.4 export 是函数')

// 1. 正路径
console.log('')
console.log('-- 正路径 --')
const a1 = createTeamAttribution({ teamEnabled: true, now: () => 1700000000000 })
eq(typeof a1.record, 'function', '1.1 实例有 record()')
const r1 = a1.record('plan.md#L10', { id: 'u-alice', name: 'Alice' }, 'merge')
eq(r1.ok, true, '1.2 record 返回 ok')
const g1 = a1.get('plan.md#L10')
eq(g1 && g1.memberId, 'u-alice', '★1.3 作者 = 上传者 id（37 卷正路径）')
eq(g1 && g1.memberName, 'Alice', '1.4 作者名正确')
eq(g1 && g1.at, 1700000000000, '1.5 时间戳来自注入的 now')
eq(g1 && g1.op, 'merge', '1.6 op 正确')
eq(a1.size(), 1, '1.7 条目数 = 1')
eq(a1.writes(), 1, '1.8 写次数 = 1')

const r1b = a1.record('logs/2026-09-27.md#L3', { memberId: 'u-bob', memberName: 'Bob' }, 'edit')
eq(r1b.ok, true, '1.9 兼容 memberId/memberName 命名')
eq((a1.get('logs/2026-09-27.md#L3') || {}).memberName, 'Bob', '1.10 第二种命名读回正确')

a1.record('k-normop', { id: 'u-c' }, 'BOGUS')
eq((a1.get('k-normop') || {}).op, 'edit', '1.11 非法 op 归一为 edit')

a1.record('plan.md#L10', { id: 'u-carol' }, 'edit')
eq(a1.size(), 3, '1.12 同 key 覆盖，size 不变')
eq((a1.get('plan.md#L10') || {}).memberId, 'u-carol', '1.13 同 key 取最新作者')

// 2. 负路径
console.log('')
console.log('-- 负路径 --')
const a2 = createTeamAttribution({ teamEnabled: true, now: () => 1 })
const before = a2.size()
const r2a = a2.record('k-no-member', null, 'merge')
eq(r2a.ok, false, '★2.1 缺 member ⇒ ok=false')
eq(r2a.reason, 'no-member', '2.2 原因 = no-member')
eq(a2.size(), before, '★2.3 缺 member ⇒ size 不变（未写入）')
eq(a2.get('k-no-member'), null, '★2.4 缺 member ⇒ get 返回 null（无空占位）')
eq(a2.writes(), 0, '2.5 缺 member ⇒ 写次数仍为 0')
eq(a2.record('k-empty-member', {}, 'merge').ok, false, '2.6 空对象 member ⇒ 拒绝')
eq(a2.record('k-empty-id', { id: '', name: '' }, 'merge').ok, false, '2.7 空字符串 member ⇒ 拒绝')
eq(a2.record('', { id: 'u-x' }, 'merge').ok, false, '2.8 无 key ⇒ 拒绝')

const rb = a2.recordMany([
  { key: 'ok-1', member: { id: 'u-1' }, op: 'merge' },
  { key: 'bad-1', member: null, op: 'merge' },
  { key: 'bad-2', op: 'merge' },
])
eq(rb.written, 1, '2.9 recordMany 只写合法条目')
eq(rb.skipped, 2, '2.10 recordMany 跳过 2 条')
eq(a2.size(), 1, '2.11 最终 size = 1')

const a2b = createTeamAttribution({ teamEnabled: true })
const rl = a2b.load({ schema: 1, items: { good: { memberId: 'u-g' }, bad: { op: 'edit' }, bad2: null } })
eq(rl.loaded, 1, '2.12 load 丢弃缺 member 的坏数据')
eq(a2b.size(), 1, '2.13 load 后 size = 1')

// 3. 隔离路径
console.log('')
console.log('-- 隔离路径 --')
const a3 = createTeamAttribution({ teamEnabled: false })
const r3 = a3.record('k-iso', { id: 'u-iso' }, 'merge')
eq(r3.ok, false, '★3.1 teamEnabled=false ⇒ record 拒绝')
eq(r3.reason, 'team-disabled', '3.2 原因 = team-disabled')
eq(a3.size(), 0, '★3.3 teamEnabled=false ⇒ size = 0')
eq(a3.writes(), 0, '★3.4 teamEnabled=false ⇒ 写次数 = 0')
eq(a3.get('k-iso'), null, '3.5 teamEnabled=false ⇒ get 返回 null')
eq(Object.keys(a3.toJSON().items).length, 0, '★3.6 teamEnabled=false ⇒ toJSON 无条目（不会落盘）')
const rl3 = a3.load({ schema: 1, items: { x: { memberId: 'u-z' } } })
eq(rl3.loaded, 0, '3.7 teamEnabled=false ⇒ load 也不加载')
eq(a3.size(), 0, '3.8 teamEnabled=false ⇒ load 后仍为 0')

// 4. 有界
console.log('')
console.log('-- 有界 --')
const a4 = createTeamAttribution({ teamEnabled: true, max: 5 })
for (let i = 0; i < 20; i++) a4.record('k' + i, { id: 'u-' + i }, 'edit')
eq(a4.size(), 5, '4.1 max=5 ⇒ size 封顶 5')
eq(a4.get('k0'), null, '4.2 最旧的被淘汰')
eq((a4.get('k19') || {}).memberId, 'u-19', '4.3 最新的保留')

// 5. 往返
console.log('')
console.log('-- 往返 --')
const snap = a1.toJSON()
const a5 = createTeamAttribution({ teamEnabled: true })
const lr = a5.load(snap)
eq(lr.loaded, Object.keys(snap.items).length, '5.1 load 条数 = toJSON 条数')
eq((a5.get('plan.md#L10') || {}).memberId, 'u-carol', '5.2 往返后作者一致')
eq(a5.size(), a1.size(), '5.3 往返后 size 一致')

// 6. describe
console.log('')
const d = a1.describe()
eq(d.kind, 'team-attribution', '6.1 describe.kind')
eq(d.file, 'team-attribution.json', '6.2 文件名 = team-attribution.json（37 卷 §1）')
eq(d.schema, 1, '6.3 schema = 1')

// 7. 物理量
console.log('')
console.log('== 可复算物理量 ==')
const sha = createHash('sha256').update(srcText, 'utf8').digest('hex')
console.log('src bytes      : ' + Buffer.byteLength(srcText))
console.log('src sha256[:16]: ' + sha.slice(0, 16))
console.log('src lines      : ' + srcText.split('\r\n').length)
console.log('PASS           : ' + PASS)
console.log('FAIL           : ' + FAIL)
console.log('')
console.log('== 结果 ==')
if (FAIL > 0) { console.log('FAIL ' + FAIL + ' / PASS ' + PASS); process.exit(1) }
console.log('PASS ' + PASS + ' / FAIL 0 — ALL GREEN')
process.exit(0)
