/**
 * 阶段 2/3：把「纯字面量」的 locale 三元站点改写为 L(中文, English)
 *
 * 只改 A/B 两侧都是字符串字面量的站点（681 处）—— 这些是 L10N 查表能命中的形态。
 * 动态拼接站点（47 处）**保持原样**：ja 档下 `zh` 布尔为 false ⇒ 自然回落 English，
 * 行为与改写后一致，但改写会把表达式做成查表键，反而引入误命中风险。
 *
 * 幂等：以「已无 locale==='zh' 的纯字面量三元」判定。
 * 断言：改写前后**站点总数守恒**（改写数 + 保留数 === 改写前总数）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const acorn = require('D:/dsh-auto-memory/node_modules/acorn')

const FILE = 'D:/dsh-auto-memory/lib/client.js'
const raw = readFileSync(FILE, 'utf8')

const parseSites = (src) => {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
  const nodes = []
  ;(function walk(n) {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (typeof n.type === 'string') nodes.push(n)
    for (const k of Object.keys(n)) if (!['type', 'start', 'end', 'loc', 'range'].includes(k)) walk(n[k])
  })(ast)
  const out = []
  for (const n of nodes) {
    if (n.type !== 'ConditionalExpression') continue
    const t = n.test
    const isLocale = t && t.type === 'BinaryExpression' && t.operator === '===' &&
      t.left && t.left.name === 'locale' && t.right && t.right.value === 'zh'
    const isZhVar = t && t.type === 'Identifier' && t.name === 'zh'
    if (isLocale || isZhVar) out.push(n)
  }
  return out
}

const total0 = parseSites(raw).length
const pure = parseSites(raw).filter((n) =>
  n.consequent.type === 'Literal' && typeof n.consequent.value === 'string' &&
  n.alternate.type === 'Literal' && typeof n.alternate.value === 'string')
const dyn = total0 - pure.length
console.log('改写前站点总数:', total0, ' 纯字面量:', pure.length, ' 动态保留:', dyn)

if (pure.length === 0) { console.log('已改写完毕，无需重复执行。'); process.exit(0) }

// 从后往前替换，保持偏移有效
const edits = pure.map((n) => ({
  start: n.start, end: n.end,
  arms: [raw.slice(n.consequent.start, n.consequent.end), raw.slice(n.alternate.start, n.alternate.end)],
  text: 'L(' + raw.slice(n.consequent.start, n.consequent.end) + ', ' + raw.slice(n.alternate.start, n.alternate.end) + ')',
})).sort((a, b) => b.start - a.start)

// 预期换行减少量 = 各站点跨度内原本包含的换行数（`L(a, b)` 本身无换行）
const expectedNlDrop = pure.reduce((acc, n) => acc + (raw.slice(n.start, n.end).match(/\r\n/g) || []).length, 0)

let out = raw
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)

// ── 守恒断言 ──
const total1 = parseSites(out).length
if (total1 !== dyn) throw new Error(`站点数不守恒：改写前 ${total0}，改写后残留 ${total1}，期望 ${dyn}`)
const crlf0 = (raw.match(/\r\n/g) || []).length
const crlf1 = (out.match(/\r\n/g) || []).length
if (crlf0 - crlf1 !== expectedNlDrop) {
  throw new Error(`换行减少量不可解释：实际 ${crlf0 - crlf1}，预期 ${expectedNlDrop}`)
}
if ((out.match(/(?<!\r)\n/g) || []).length !== 0) throw new Error('出现裸 LF')
// ★两臂逐字保留：每个站点必须产出 `L(<原臂1>, <原臂2>)` 且原文该形态出现
for (const e of edits) {
  const want = 'L(' + e.arms[0] + ', ' + e.arms[1] + ')'
  if (!out.includes(want)) throw new Error('臂文本未逐字保留: ' + want.slice(0, 90))
}
if ((out.match(/function L\(a, b\) \{/g) || []).length !== 1) throw new Error('L 定义应恰 1 处')

writeFileSync(FILE, out)
console.log('[patch2] OK  改写站点:', edits.length, ' 残留动态站点:', total1)
console.log('  字符数:', raw.length, '->', out.length)
console.log('  CRLF:', crlf0, '->', crlf1, '(可解释的减少 =', expectedNlDrop, ')  裸 LF: 0')
