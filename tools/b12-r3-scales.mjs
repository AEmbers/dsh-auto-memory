#!/usr/bin/env node
// B12 R3 通用刻度 token 化（font-size / border-radius / box-shadow / backdrop-filter / transition）
// 用法：node tools/b12-r3-scales.mjs [--dry|--apply] [--only=font-size,box-shadow]
// 纪律：①只改 var() 之外的字面量 ②族纯度（padding→space / font-size→fontsize / radius→radius …）
//   ③零视觉变化=展开回原值后与改前逐字节相同（扣除新增定义段） ④复合值按段拆解，拆不开则整值成 token
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'lib', 'client.js')
const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean)
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()

// ── 属性 → token 族 + 模式 ──────────────────────────────────
//   split：按空白拆段，每段必须命中族内单值 token（否则整值成 token）
//   whole：整个值成为 1 个 token
const MAP = {
  'padding':        { fam: 'space', mode: 'split' },
  'padding-top':    { fam: 'space', mode: 'split' },
  'padding-right':  { fam: 'space', mode: 'split' },
  'padding-bottom': { fam: 'space', mode: 'split' },
  'padding-left':   { fam: 'space', mode: 'split' },
  'gap':            { fam: 'space', mode: 'split' },
  'row-gap':        { fam: 'space', mode: 'split' },
  'column-gap':     { fam: 'space', mode: 'split' },
  'font-size':      { fam: 'fontsize', mode: 'split' },
  'border-radius':  { fam: 'radius', mode: 'split' },
  'box-shadow':     { fam: 'shadow', mode: 'whole' },
  'backdrop-filter':{ fam: 'backdrop', mode: 'whole' },
  'transition':     { fam: 'transition', mode: 'whole' },
}
const PROPS = Object.keys(MAP).filter((p) => !ONLY.length || ONLY.includes(p))

let raw = readFileSync(SRC, 'utf8')
const B0 = sha16(raw)
const iCss = raw.indexOf('var CSS = [')
const iEnd = raw.indexOf("].join('\\n')", iCss)
if (iCss < 0 || iEnd < 0) { console.error('CSS 段定位失败'); process.exit(1) }
const css = raw.slice(iCss, iEnd)

// ── var() 掩码 ───────────────────────────────────────────────
const mask = new Array(css.length).fill(false)
for (let i = 0; i < css.length; i++) {
  if (!css.startsWith('var(', i)) continue
  let d = 0, j = i
  for (; j < css.length; j++) { if (css[j] === '(') d++; else if (css[j] === ')') { d--; if (d === 0) { j++; break } } }
  for (let k = i; k < j; k++) mask[k] = true
  i = j - 1
}

// ── 既有族内单值表（按族）───────────────────────────────────
const famMap = {}   // fam -> { value: token }
const defRe = /(--dam-([a-z]+)[a-z0-9-]*)\s*:\s*([^;\r\n']+);/g
let dm
while ((dm = defRe.exec(css))) {
  const tok = dm[1], fam = dm[2], val = dm[3].trim()
  if (!famMap[fam]) famMap[fam] = {}
  if (!(val in famMap[fam])) famMap[fam][val] = tok
}

// ── 扫描 ─────────────────────────────────────────────────────
const edits = []
const newDefs = []          // 新增定义（按 fam 分组）
const autoIdx = {}          // fam -> 下一个序号
const skipped = []
const declRe = /([a-z-]+)\s*:\s*([^;\r\n'}]*)/g
let m
while ((m = declRe.exec(css))) {
  const prop = m[1]
  const cfg = MAP[prop]
  if (!cfg || (ONLY.length && !ONLY.includes(prop))) continue
  const valStart = m.index + m[0].indexOf(m[2])
  const valEnd = valStart + m[2].length
  const value = m[2].trim()
  if (!value || mask[valStart]) continue
  // ★保护：@supports 条件里的是【特性检测】，不是样式声明；且此处含既有语法缺陷
  //   （'not ((backdrop-filter: blur(1px) or (...))' 的 or 位置错），替换会顺带改语义 ⇒ 排除，记为 D9
  if (/@supports not \(\(/.test(css.slice(Math.max(0, m.index - 200), m.index))) { skipped.push(prop + ': [@supports 特性检测·D9 排除]'); continue }
  const fam = cfg.fam
  if (!famMap[fam]) famMap[fam] = {}
  const need = (v) => {
    if (famMap[fam][v]) return famMap[fam][v]
    autoIdx[fam] = (autoIdx[fam] || 0) + 1
    const tok = '--dam-' + fam + '-x' + autoIdx[fam]
    famMap[fam][v] = tok
    newDefs.push({ fam: fam, tok: tok, val: v })
    return tok
  }
  let repl = null
  if (cfg.mode === 'split') {
    const parts = value.split(/\s+/)
    const out = []
    let ok = true
    for (const p of parts) { if (!/^[\d.]+(px|rem|em)$|^0$/.test(p)) { ok = false; break } ; out.push('var(' + need(p) + ', ' + p + ')') }
    if (ok) repl = out.join(' ')
  } else {
    // ★必须带 fallback：新定义在 [data-dam-panel]/[data-dam-page] 块内，
    //   若使用点在该作用域外，无 fallback 会整条丢声明（D1 同类风险）。
    repl = 'var(' + need(value) + ', ' + value + ')'
  }
  if (!repl) { skipped.push(prop + ': ' + value); continue }
  edits.push({ start: valStart, end: valEnd, orig: m[2], repl: repl, prop: prop })
}

console.log('B0 = ' + B0 + ' | 目标属性 ' + PROPS.length + ' 类')
console.log('可 token 化声明 = ' + edits.length + ' | 跳过（非刻度）= ' + skipped.length)
if (skipped.length) console.log('  跳过明细（去重前 6）:', [...new Set(skipped)].slice(0, 6).join(' / '))
const byFam = {}
edits.forEach((e) => { const f = MAP[e.prop].fam; byFam[f] = (byFam[f] || 0) + 1 })
console.log('按族:', Object.entries(byFam).map(([k, v]) => k + '=' + v).join(' '))
console.log('新增定义 = ' + newDefs.length)
console.log('样例（前 6）:')
edits.slice(0, 6).forEach((e) => console.log('   ' + e.prop + ': "' + e.orig + '" → "' + e.repl + '"'))

// ── 应用替换 ─────────────────────────────────────────────────
let out = css
for (let i = edits.length - 1; i >= 0; i--) { const e = edits[i]; out = out.slice(0, e.start) + e.repl + out.slice(e.end) }

// ── 追加新定义（挂在 space 表的 --dam-space-s17 之后，新增独立注释行）──
// ★锚点必须唯一（含行尾 "',"，否则插入多行会截断 JS 字符串字面量 —— R3 首轮因此把 client.js 打崩）
const ANCHOR_S = "--dam-space-pair-1-3: 4px 12px;',"
{
  const hits = out.split(ANCHOR_S).length - 1
  console.log('锚点命中 = ' + hits + '（必须 = 1）')
  if (hits !== 1) { console.error('E_ANCHOR_AMBIGUOUS'); process.exit(1) }
}
let INSERTED = ''
if (newDefs.length) {
  const ANCHOR = ANCHOR_S
  if (!out.includes(ANCHOR)) { console.error('E_ANCHOR_MISS'); process.exit(1) }
  const lines = []
  const byFam2 = {}
  newDefs.forEach((d) => { (byFam2[d.fam] = byFam2[d.fam] || []).push(d) })
  lines.push("      // B12 R3 (2026-09-27): 复合/缺失刻度 token 化（客户可覆写）。族名=属性语义，值即原字面量。")
  Object.entries(byFam2).forEach(([fam, arr]) => {
    lines.push("      '" + arr.map((d) => d.tok + ': ' + d.val + ';').join(' ') + "',")
  })
  INSERTED = '\r\n' + lines.join('\r\n')
  out = out.replace(ANCHOR, ANCHOR + INSERTED)
}

// ★CRLF 增量必须由实际插入串决定（前导 1 个 + 行间 N 个），不靠推算
const ADDED_CRLF = INSERTED ? (INSERTED.match(/\r\n/g) || []).length : 0
const after = raw.slice(0, iCss) + out + raw.slice(iEnd)

// ── 守恒 + 零视觉变化 ────────────────────────────────────────
// ★括号配对展开（正则无法处理 fallback 内的 rgba() 嵌套）
const expand = (s) => {
  let out = '', i = 0
  while (i < s.length) {
    if (s.startsWith('var(', i)) {
      let d = 0, j = i, comma = -1
      for (; j < s.length; j++) {
        const c = s[j]
        if (c === '(') d++
        else if (c === ')') { d--; if (d === 0) break }
        else if (c === ',' && d === 1 && comma < 0) comma = j
      }
      if (comma > 0) { out += s.slice(comma + 1, j).trim(); i = j + 1; continue }
    }
    out += s[i]; i++
  }
  return out === s ? out : expand(out)   // ★迭代到不动点
}
const crlf0 = (raw.match(/\r\n/g) || []).length, crlf1 = (after.match(/\r\n/g) || []).length
const checks = [
  ['① 前缀逐字节不变', after.startsWith(raw.slice(0, iCss))],
  ['② 后缀逐字节不变', after.endsWith(raw.slice(iEnd))],
  ['③ CRLF 精确 +' + ADDED_CRLF + '（实测 +' + (crlf1 - crlf0) + '）', crlf1 - crlf0 === ADDED_CRLF],
  ['④ 裸 LF = 0', !/(^|[^\r])\n/.test(after)],
  ['⑤ data-dam-* 总数不变', (after.match(/data-dam-/g) || []).length === (raw.match(/data-dam-/g) || []).length],
  ['⑥ ★零视觉变化（两边都整体展开后逐字节相同）', sha16(expand(out)) === sha16(expand(css.replace(ANCHOR_S, ANCHOR_S + INSERTED)))],
  // ★族纯度只判「被替换出来的 token 名」（取每个 var( 的第一个参数），
  //   fallback 内允许含其他族引用 —— 那是原值本身带的，不是本工具引入的
  // ★只判「替换串包在最外层的那一个 token 名」（fallback 内本就含其他族引用，非本工具引入）
  ['⑦ 族纯度：外层 token 均属本族', edits.every((e) => {
    const g = e.repl.match(/^var\((--dam-[a-z0-9-]+)/)
    return !!g && g[1].startsWith('--dam-' + MAP[e.prop].fam)
  })],
]
{
  const A = expand(out), Bd = expand(css.replace(ANCHOR_S, ANCHOR_S + INSERTED))
  if (A !== Bd) {
    let i = 0; while (i < A.length && A[i] === Bd[i]) i++
    console.log('  [诊断] 首个差异 @' + i)
    console.log('    新: ' + JSON.stringify(A.slice(Math.max(0, i - 60), i + 60)))
    console.log('    旧: ' + JSON.stringify(Bd.slice(Math.max(0, i - 60), i + 60)))
  }
  const bad7 = edits.filter((e) => {
    const g = e.repl.match(/^var\((--dam-[a-z0-9-]+)/)
    return !(g && g[1].startsWith('--dam-' + MAP[e.prop].fam))
  })
  bad7.slice(0, 3).forEach((e) => console.log('  [纯度反例] ' + e.prop + ' → ' + e.repl.slice(0, 90)))
}
let bad = 0
for (const [k, v] of checks) { console.log((v ? '  ✅ ' : '  ❌ ') + k); if (!v) bad++ }
const B1 = sha16(after)
console.log('B1 = ' + B1 + ' | 字节 ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(after, 'utf8'))
if (bad) { console.error('❌ ' + bad + ' 条断言失败，拒绝写盘'); process.exit(1) }
if (!APPLY) { console.log('（--dry 预演完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r3-' + Date.now())
writeFileSync(SRC, after, 'utf8')
console.log('✅ 已写盘（含备份）')
