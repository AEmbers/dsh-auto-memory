#!/usr/bin/env node
// B12 R2 刻度 token 化（padding / gap 族）：--dry 只读预演 / --apply 写盘
// 纪律：①全程字符串级，不 split('\n').join('\n') ②只改 var() 之外的字面量 ③零视觉变化=展开回原值后 sha 相同
// ④复合值拆解为已有 --dam-space-* 单值 token 序列 ⑤白名单（clamp 等）记录不替换
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'lib', 'client.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()

let raw = readFileSync(SRC, 'utf8')
const B0 = sha16(raw)
const iCss = raw.indexOf('var CSS = [')
const iEnd = raw.indexOf("].join('\\n')", iCss)
if (iCss < 0 || iEnd < 0) { console.error('CSS 段定位失败'); process.exit(1) }
const css = raw.slice(iCss, iEnd)

// ── 1. 建立 var() 区间掩码（只处理括号之外）──────────────────────
const mask = new Array(css.length).fill(false)
for (let i = 0; i < css.length; i++) {
  if (!css.startsWith('var(', i)) continue
  let d = 0, j = i
  for (; j < css.length; j++) { if (css[j] === '(') d++; else if (css[j] === ')') { d--; if (d === 0) { j++; break } } }
  for (let k = i; k < j; k++) mask[k] = true
  i = j - 1
}

// ── 2. 已定义 token 表：值 -> token 名 ──────────────────────────
// ★语义纪律：padding/gap 只能用 --dam-space-* 族 token（不得借 radius/fontsize 等族替代，
//   否则客户改圆角会连带改间距 —— 数值等价但语义污染）
const SPACE_PREFIX = '--dam-space-'
const MISSING = [
  "'  --dam-space-1: 1px; --dam-space-s0-75: 3px; --dam-space-s7-5: 15px; --dam-space-s10-5: 17px;',",
  "'  --dam-space-s15-5: 30px; --dam-space-s16: 52px; --dam-space-s17: 56px;',",
]
const defRe = new RegExp('(' + SPACE_PREFIX + '[a-z0-9-]+)\\s*:\\s*([^;\\r\\n\']+);', 'g')
const val2tok = {}
let dm
while ((dm = defRe.exec(css))) { const v = dm[2].trim(); if (!(v in val2tok)) val2tok[v] = dm[1] }
// 把待补刻度也纳入映射（它们将以定义行形式追加）
for (const line of MISSING) {
  const re2 = new RegExp('(' + SPACE_PREFIX + '[a-z0-9-]+)\\s*:\\s*([^;\\r\\n\']+);', 'g')
  let m2
  while ((m2 = re2.exec(line))) { const v = m2[2].trim(); if (!(v in val2tok)) val2tok[v] = m2[1] }
}

// ── 3. 扫描目标属性（掩码之外）─────────────────────────────────
const PROPS = new Set(['padding','padding-top','padding-right','padding-bottom','padding-left','gap','row-gap','column-gap'])
const edits = []      // {start,end,orig,repl}
const whitelist = []  // 未替换（含 var() / clamp() / 未知刻度）
const declRe = /([a-z-]+)\s*:\s*([^;\r\n'}]*)/g
let m
while ((m = declRe.exec(css))) {
  const prop = m[1]
  if (!PROPS.has(prop)) continue
  const valStart = m.index + m[0].indexOf(m[2])
  const valEnd = valStart + m[2].length
  const value = m[2].trim()
  if (!value) continue
  // 掩码内的整段跳过（已 token 化）
  if (mask[valStart]) continue
  const parts = value.split(/\s+/)
  const out = []
  let ok = true
  for (const p of parts) {
    const tok = val2tok[p]
    if (!tok) { ok = false; break }
    out.push('var(' + tok + ', ' + p + ')')
  }
  if (!ok) { whitelist.push(prop + ': ' + value); continue }
  edits.push({ start: valStart, end: valEnd, orig: m[2], repl: out.join(' ') })
}

console.log('B0 = ' + B0 + ' | CSS 段 ' + Buffer.byteLength(css, 'utf8') + ' B')
console.log('可 token 化声明 = ' + edits.length + ' | 白名单（保留字面）= ' + whitelist.length)
console.log('白名单明细（去重）:', [...new Set(whitelist)].join(' / ') || '（无）')
console.log('涉及属性值样例（前 8）:')
edits.slice(0, 8).forEach((e) => console.log('   "' + e.orig + '" -> "' + e.repl + '"'))

// ── 4. 应用（从后往前替换，保证偏移稳定）───────────────────────
let out = css
for (let i = edits.length - 1; i >= 0; i--) {
  const e = edits[i]
  out = out.slice(0, e.start) + e.repl + out.slice(e.end)
}
// ── 4b. 追加缺失的 space 刻度定义（插在 --dam-space-pair-1-3 那行之后）──
const SPACE_ANCHOR_RE = /--dam-space-pair-1-3:[^']*',/
const am = out.match(SPACE_ANCHOR_RE)
if (!am) { console.error('❌ space 表锚点未命中，拒绝继续'); process.exit(1) }
const addLines = MISSING.join('\r\n')
const INSERTED = '\r\n      ' + addLines   // ★整段插入（含前导空白）——零视觉变化断言要精确剥离它
out = out.replace(SPACE_ANCHOR_RE, am[0] + INSERTED)
const ADDED_CRLF = 2 // 新增 2 行定义 => +2 个 CRLF（前置 1 + 行间 1）
const after = raw.slice(0, iCss) + out + raw.slice(iEnd)

// ── 5. 守恒 + 零视觉变化断言 ───────────────────────────────────
const expand = (s) => s.replace(/var\(\s*(--dam-[a-z0-9-]+)\s*,\s*([^()]*?)\s*\)/g, (_, _t, v) => v.trim())
const checks = [
  ['① 前缀逐字节不变', after.startsWith(raw.slice(0, iCss))],
  ['② 后缀逐字节不变', after.endsWith(raw.slice(iEnd))],
  ['③ CRLF 精确 +' + ADDED_CRLF, (after.match(/\r\n/g) || []).length === (raw.match(/\r\n/g) || []).length + ADDED_CRLF],
  ['④ 裸 LF = 0', !/(^|[^\r])\n/.test(after)],
  ['⑤ data-dam-* 总数不变', (after.match(/data-dam-/g) || []).length === (raw.match(/data-dam-/g) || []).length],
  // ★零视觉变化：把「替换后的 CSS」展开回原值、并扣除新增的 2 行定义 ⇒ 必须与「原 CSS 展开后」逐字节相同
  ['⑥ ★零视觉变化（替换部分展开后逐字节相同）',
    sha16(expand(out).replace(INSERTED, '')) === sha16(expand(css))],
  ['⑦ 行数精确 +' + ADDED_CRLF, after.split('\r\n').length === raw.split('\r\n').length + ADDED_CRLF],
  ['⑧ space 刻度新增行 = 2', (out.match(/--dam-space-s17: 56px;/g) || []).length === 1],
  ['⑨ 替换声明数 = ' + edits.length, edits.length >= 60],
  ['⑩ 空间族纯度：替换串只含 --dam-space-*', edits.every((e) => !/--dam-(?!space-)[a-z]/.test(e.repl))],
]
let bad = 0
for (const [k, v] of checks) { console.log((v ? '  ✅ ' : '  ❌ ') + k); if (!v) bad++ }

const B1 = sha16(after)
console.log('B1 = ' + B1 + ' | 字节 ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(after, 'utf8'))
if (bad) { console.error('❌ ' + bad + ' 条断言失败，拒绝写盘'); process.exit(1) }
if (!APPLY) { console.log('（--dry 预演完成，未写盘；加 --apply 落盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r2-' + Date.now())
writeFileSync(SRC, after, 'utf8')
console.log('✅ 已写盘（含备份）')
