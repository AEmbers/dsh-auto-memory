#!/usr/bin/env node
// B12 R5 裸 rgba/rgb -> 语义 token（101 处 / 76 distinct）
// 命名：白/黑透明度层 -> --dam-white-NN / --dam-black-NN（NN=alpha 数字）；其余 -> --dam-rgba-N（渐变/阴影专用色）
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

const mkV = (s) => {
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
const mk = mkV(css)

// ★必须浮点归一：'0.9' 与 '.9' 是同一透明度，字符串截断会得到不同/非法结果（实测 '0.9' -> '0.'）
const alphaNum = (a) => String(Math.round(parseFloat(String(a)) * 100))
const nameOf = (v) => {
  let m = v.match(/^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)$/)
  if (m) return '--dam-white-' + alphaNum(m[1])
  m = v.match(/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)$/)
  if (m) return '--dam-black-' + alphaNum(m[1])
  return null
}

const edits = [], brand = []
{
  const re = /rgba?\([^)]*\)/g
  let m
  while ((m = re.exec(css))) {
    const i = m.index
    // ★区间级重叠检查：rgba(var(--x),.52) 内部有嵌套 var()，只查起点会把它误替换
    let overlap = false
    for (let k = i; k < i + m[0].length; k++) if (mk[k]) { overlap = true; break }
    if (overlap) continue
    const v = m[0]
    let tok = nameOf(v)
    if (!tok) { brand.push(v); tok = '@BRAND@' + brand.length }
    edits.push({ start: i, end: i + v.length, val: v, tok: tok })
  }
}
console.log('B0 = ' + B0)
console.log('裸 rgba/rgb 命中 = ' + edits.length + ' | 白/黑透明度层 = ' + (edits.length - brand.length) + ' | 品牌色 = ' + brand.length)

// 品牌色去重编号（按出现顺序）
const brandUniq = [...new Set(brand)]
const brandName = {}
brandUniq.forEach((v, i) => { brandName[v] = '--dam-rgba-' + (i + 1) })
const finalEdits = edits.map((e) => (e.tok.startsWith('@BRAND@') ? Object.assign({}, e, { tok: brandName[e.val] }) : e))
const allEdits = finalEdits
const tokSet = [...new Set(allEdits.map((e) => e.tok))]
console.log('token 总数 = ' + tokSet.length + '（白/黑 ' + (tokSet.length - brandUniq.length) + ' + 品牌 ' + brandUniq.length + '）')

const out1 = (() => {
  let o = css
  for (let i = allEdits.length - 1; i >= 0; i--) {
    const e = allEdits[i]
    o = o.slice(0, e.start) + 'var(' + e.tok + ', ' + e.val + ')' + o.slice(e.end)
  }
  return o
})()

const existing = new Set(css.match(/--dam-[a-z0-9-]+(?=\s*:)/g) || [])
const valOf = {}
allEdits.forEach((e) => { if (!(e.tok in valOf)) valOf[e.tok] = e.val })
const needDefs = tokSet.filter((k) => !existing.has(k))
const ANCHOR_S = "--dam-space-pair-1-3: 4px 12px;',"
{
  const hits = out1.split(ANCHOR_S).length - 1
  console.log('锚点命中 = ' + hits + '（必须 = 1）')
  if (hits !== 1) { console.error('E_ANCHOR_AMBIGUOUS'); process.exit(1) }
}
let INSERTED = ''
if (needDefs.length) {
  const lines = []
  lines.push("      // B12 R5 (2026-09-27): 裸 rgba/rgb -> token（白/黑=透明度层；rgba-N=渐变/阴影专用色，客户可覆写）。")
  for (let i = 0; i < needDefs.length; i += 4) {
    const grp = needDefs.slice(i, i + 4).map((k) => k + ': ' + valOf[k] + ';').join(' ')
    lines.push("      '" + grp + "',")
  }
  INSERTED = '\r\n' + lines.join('\r\n')
}
const out = out1.replace(ANCHOR_S, ANCHOR_S + INSERTED)
const ADDED_CRLF = INSERTED ? (INSERTED.match(/\r\n/g) || []).length : 0
const after = raw.slice(0, iCss) + out + raw.slice(iEnd)

const NEG = process.argv.includes('--negtest')
const outForCheck = NEG ? out + ' .x { background: rgba(1,2,3,.5); }' : out

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
  ['⑥ ★零视觉变化', sha16(expand(out)) === sha16(expand(css.replace(ANCHOR_S, ANCHOR_S + INSERTED)))],
  // ★负路径：--negtest 注入一处纯裸 rgba，本断言必须变红
  ['⑦ 无「非嵌套」裸 rgba 残留（残留项必须全部是 rgba(var(...),a) 形式）', (() => {
    const mm = mkV(outForCheck)
    const eff = outForCheck.split('').map((ch, i) => mm[i] ? '\u0000' : ch).join('')
    const r0 = eff.match(/rgba?\([^)]*\)/g) || []
    const r = r0.filter((s) => !s.includes('\u0000'))
    console.log('      残留合计 = ' + r0.length + ' | 非嵌套 = ' + r.length)
    if (r.length) console.log('      非法残留：' + r.slice(0, 3).join(' '))
    return r.length === 0
  })()],
]
{
  const A = expand(out), Bd = expand(css.replace(ANCHOR_S, ANCHOR_S + INSERTED))
  if (A !== Bd) {
    let i = 0; while (i < A.length && A[i] === Bd[i]) i++
    console.log('  [诊断] 首个差异 @' + i)
    console.log('    新: ' + JSON.stringify(A.slice(Math.max(0, i - 70), i + 70)))
    console.log('    旧: ' + JSON.stringify(Bd.slice(Math.max(0, i - 70), i + 70)))
  }
}
let bad = 0
for (const [k, v] of checks) { console.log((v ? '  OK  ' : '  NG  ') + k); if (!v) bad++ }
console.log('B1 = ' + sha16(after) + ' | 字节 ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(after, 'utf8'))
console.log('新增定义 = ' + needDefs.length + ' 个')
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r5-' + Date.now())
writeFileSync(SRC, after, 'utf8')
console.log('已写盘（含备份）')