#!/usr/bin/env node
// B12 R4 裸 hex → 语义 token（26 处 / 12 distinct）
// 纪律：只处理 var()/注释/--dam 定义之外的字面；按语义角色命名；每处带 fallback；锚点唯一性断言。
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
const css = raw.slice(iCss, iEnd)

const V = new Array(css.length).fill(false)
for (let i = 0; i < css.length; i++) {
  if (!css.startsWith('var(', i)) continue
  let d = 0, j = i
  for (; j < css.length; j++) { if (css[j] === '(') d++; else if (css[j] === ')') { d--; if (d === 0) { j++; break } } }
  for (let k = i; k < j; k++) V[k] = true
  i = j - 1
}
const C = new Array(css.length).fill(false)
{ const re = /\/\/[^\r\n]*/g; let m; while ((m = re.exec(css))) for (let k = m.index; k < m.index + m[0].length; k++) C[k] = true }
const D = new Array(css.length).fill(false)
{ const re = /--dam-[a-z0-9-]+\s*:[^;]*;?/g; let m; while ((m = re.exec(css))) for (let k = m.index; k < m.index + m[0].length; k++) D[k] = true }
const blocked = (i) => V[i] || C[i] || D[i]

const ROLE = (hex, decl) => {
  const h = hex.toLowerCase(), d = decl.toLowerCase()
  if (h === '#fff') {
    if (/(^|[\s;(,])color\s*:/.test(d)) return '--dam-fg-on-accent'
    if (/background\s*:/.test(d) && !/gradient/.test(d)) return '--dam-surface'
    return '--dam-highlight'
  }
  if (h === '#000') return '--dam-shadow-tint'
  if (h === '#7d8793') return '--dam-legend-branch'
  if (h === '#b0b7c0') return '--dam-legend-leaf'
  if (h === '#17a673') return '--dam-state-ok'
  if (h === '#e5484d') return '--dam-state-bad'
  if (h === '#d97706') return '--dam-warn'
  if (h === '#4a76f0') return '--dam-accent-2'
  if (h === '#527cf6') return '--dam-cta-from'
  if (h === '#2b56d4') return '--dam-cta-to'
  if (h === '#7ea4ff') return '--dam-accent-3'
  if (h === '#9db8ff') return '--dam-accent-4'
  return null
}

const edits = [], unmatched = []
{
  const re = /#[0-9a-fA-F]{3,8}\b/g
  let m
  while ((m = re.exec(css))) {
    const i = m.index
    if (blocked(i)) continue
    let s = i; while (s > 0 && !/[;{}\n]/.test(css[s - 1])) s--
    const decl = css.slice(s, i) + m[0]
    const tok = ROLE(m[0], decl)
    if (!tok) { unmatched.push(m[0] + ' <- ' + decl.trim().slice(-60)); continue }
    edits.push({ start: i, end: i + m[0].length, hex: m[0], tok: tok, decl: decl.trim().slice(-70) })
  }
}

console.log('B0 = ' + B0)
console.log('裸 hex 命中 = ' + edits.length + ' | 未匹配角色 = ' + unmatched.length)
const byTok = {}
edits.forEach((e) => { (byTok[e.tok] = byTok[e.tok] || []).push(e.hex) })
console.log('token 数 = ' + Object.keys(byTok).length)
Object.entries(byTok).forEach(([t, arr]) => console.log('   ' + t.padEnd(24) + ' x' + arr.length + '  ' + [...new Set(arr)].join(',')))
if (unmatched.length) unmatched.forEach((u) => console.log('   [未匹配] ' + u))

let out = css
for (let i = edits.length - 1; i >= 0; i--) {
  const e = edits[i]
  out = out.slice(0, e.start) + 'var(' + e.tok + ', ' + e.hex + ')' + out.slice(e.end)
}


// ── 追加缺失 token 定义（复用已有同名 token 的不重复定义）──
const existing = new Set(css.match(/--dam-[a-z0-9-]+(?=\s*:)/g) || [])
const valOf = {}
edits.forEach((e) => { if (!(e.tok in valOf)) valOf[e.tok] = e.hex })
const needDefs = [...new Set(edits.map((e) => e.tok))].filter((k) => !existing.has(k))
const ANCHOR_S = "--dam-space-pair-1-3: 4px 12px;',"
{
  const hits = out.split(ANCHOR_S).length - 1
  console.log('锚点命中 = ' + hits + '（必须 = 1）')
  if (hits !== 1) { console.error('E_ANCHOR_AMBIGUOUS'); process.exit(1) }
}
let INSERTED = ''
if (needDefs.length) {
  const lines = []
  lines.push("      // B12 R4 (2026-09-27): 裸 hex -> 语义 token（按角色命名，客户可整体覆写配色）。")
  for (let i = 0; i < needDefs.length; i += 4) {
    const grp = needDefs.slice(i, i + 4).map((k) => k + ': ' + valOf[k] + ';').join(' ')
    lines.push("      '" + grp + "',")
  }
  INSERTED = '\r\n' + lines.join('\r\n')
  out = out.replace(ANCHOR_S, ANCHOR_S + INSERTED)
}

const ADDED_CRLF = INSERTED ? (INSERTED.match(/\r\n/g) || []).length : 0
const after = raw.slice(0, iCss) + out + raw.slice(iEnd)

const expand = (s) => {
  let o = '', i = 0
  while (i < s.length) {
    if (s.startsWith('var(', i)) {
      let d = 0, j = i, comma = -1
      for (; j < s.length; j++) { const ch = s[j]; if (ch === '(') d++; else if (ch === ')') { d--; if (d === 0) break } else if (ch === ',' && d === 1 && comma < 0) comma = j }
      if (comma > 0) { o += s.slice(comma + 1, j).trim(); i = j + 1; continue }
    }
    o += s[i]; i++
  }
  return o === s ? o : expand(o)
}
const crlf0 = (raw.match(/\r\n/g) || []).length, crlf1 = (after.match(/\r\n/g) || []).length
const checks = [
  ['① 前缀逐字节不变', after.startsWith(raw.slice(0, iCss))],
  ['② 后缀逐字节不变', after.endsWith(raw.slice(iEnd))],
  ['③ CRLF 精确 +' + ADDED_CRLF + '（实测 +' + (crlf1 - crlf0) + '）', crlf1 - crlf0 === ADDED_CRLF],
  ['④ 裸 LF = 0', !/(^|[^\r])\n/.test(after)],
  ['⑤ data-dam-* 总数不变', (after.match(/data-dam-/g) || []).length === (raw.match(/data-dam-/g) || []).length],
  ['⑥ ★零视觉变化（两边整体展开后逐字节相同）', sha16(expand(out)) === sha16(expand(css.replace(ANCHOR_S, ANCHOR_S + INSERTED)))],
  // ★必须对【新的 out】重建掩码：旧掩码索引在替换后已错位
  ['⑦ 残留裸 hex（out 重建三重掩码后）= 0', (() => {
    const off = (s) => {
      const m = new Array(s.length).fill(false)
      for (let i = 0; i < s.length; i++) {
        if (!s.startsWith('var(', i)) continue
        let d = 0, j = i
        for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') { d--; if (d === 0) { j++; break } } }
        for (let k = i; k < j; k++) m[k] = true
        i = j - 1
      }
      let x; const rc = /\/\/[^\r\n]*/g; while ((x = rc.exec(s))) for (let k = x.index; k < x.index + x[0].length; k++) m[k] = true
      const rd = /--dam-[a-z0-9-]+\s*:[^;]*;?/g; while ((x = rd.exec(s))) for (let k = x.index; k < x.index + x[0].length; k++) m[k] = true
      return m
    }
    const mm = off(out)
    const eff = out.split('').map((ch, i) => mm[i] ? '\u0000' : ch).join('')
    const rest = eff.match(/#[0-9a-fA-F]{3,8}\b/g) || []
    if (rest.length) console.log('      残留：' + [...new Set(rest)].join(','))
    return rest.length === 0
  })()],
]
let bad = 0
for (const [k, v] of checks) { console.log((v ? '  OK  ' : '  NG  ') + k); if (!v) bad++ }
const B1 = sha16(after)
console.log('B1 = ' + B1 + ' | 字节 ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(after, 'utf8'))
console.log('新增定义 = ' + needDefs.length + ' 个（复用已有 = ' + (Object.keys(valOf).length - needDefs.length) + ' 个）')
if (bad) { console.error('NG ' + bad + ' 条断言失败，拒绝写盘'); process.exit(1) }
if (!APPLY) { console.log('（--dry 预演完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r4-' + Date.now())
writeFileSync(SRC, after, 'utf8')
console.log('已写盘（含备份）')