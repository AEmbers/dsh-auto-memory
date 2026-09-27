/**
 * 把 tools/i18n/ja-fill.json 的译文合并进 lib/client.js
 *   dict   → 追加到 `I18N.ja = {...}` 对象内
 *   inline → 追加到 `var L10N = { ja: {...} }` 的 ja 对象内
 *
 * 做法：定位两个对象的**闭合 `}`**，在其前插入新条目（保持 CRLF、不改动既有条目）。
 * 断言：CRLF 数不降；裸 LF 仍为 0；插入条数 = 预期；每个新键在源码里能查到。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const P = 'D:/dsh-auto-memory/lib/client.js'
const src = readFileSync(P, 'utf8')
const fill = JSON.parse(readFileSync('D:/dsh-auto-memory/tools/i18n/ja-fill.json', 'utf8'))
const EOL = '\r\n'

/** 找 `anchor` 之后第一个 `{` 的配平闭合下标（返回 `}` 的位置） */
function closeBraceOf(text, anchor) {
  const i = text.indexOf(anchor)
  if (i < 0) throw new Error('找不到锚点: ' + anchor)
  let k = text.indexOf('{', i + anchor.length - 1)
  if (k < 0) throw new Error('锚点后无 `{`: ' + anchor)
  let depth = 0, inS = null, esc = false, inLine = false, inBlock = false
  for (let j = k; j < text.length; j++) {
    const c = text[j], n = text[j + 1]
    if (inLine) { if (c === '\n') inLine = false; continue }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; j++ } continue }
    if (inS) {
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === inS) inS = null
      continue
    }
    if (c === '/' && n === '/') { inLine = true; j++; continue }
    if (c === '/' && n === '*') { inBlock = true; j++; continue }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return j }
  }
  throw new Error('未配平: ' + anchor)
}

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n') + "'"

let out = src

// ── 1. I18N.ja ──────────────────────────────────────────────
{
  const anchor = 'I18N.ja = {'
  const open = out.indexOf(anchor)
  if (open < 0) throw new Error('找不到 I18N.ja 赋值')
  const close = closeBraceOf(out, anchor)
  // ★去重必须只在 **ja 对象体内** 判定：同名字符串在 I18N.zh / I18N.en 里已存在，
  //   若扫全文件会误判「已存在」⇒ 22 条真缺口被静默跳过（本轮实测踩到）。
  const body = out.slice(open, close)
  // ★同样要允许引号前缀（I18N.zh / en 的键可能是裸标识符或带引号）。
  const need = Object.entries(fill.dict).filter(([k]) => {
    const e = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp('(?:^|[\\s{,"\'])(\\"?)' + e + '\\s*\\1\\s*:').test(body)
  })
  if (!need.length) { console.log('dict: 无需新增') }
  else {
    const block = need.map(([k, v]) => '  ' + k + ': ' + q(v) + ',').join(EOL)
    const prev = out.slice(0, close).replace(/[ \t]+$/, '')
    const sep = /,\s*$/.test(prev) ? '' : ','
    out = out.slice(0, close) + sep + EOL + block + EOL + out.slice(close)
    console.log('dict: 新增 ' + need.length + ' 条 → ' + need.map(([k]) => k).join(','))
  }
}

// ── 2. L10N.ja ──────────────────────────────────────────────
{
  // ★结构是 `var L10N = { ja: {` —— 内层 ja 与外层同处一行。
  //   若直接对 `var L10N = {` 配平，取到的是**外层**闭合 ⇒ 新条目落到 L10N 顶层而非 ja 内
  //   （本轮实测：插了 245 条但 l10nJa 仍 367）。必须定位到 `ja:` 之后那个 `{`。
  const outer = out.indexOf('var L10N')
  if (outer < 0) throw new Error('找不到 var L10N')
  const jaKey = out.indexOf('ja', outer)
  if (jaKey < 0) throw new Error('L10N 内找不到 ja 键')
  const braceAt = out.indexOf('{', jaKey)
  if (braceAt < 0) throw new Error('ja 后无 `{`')
  // 从该 `{` 起配平
  let depth = 0, inS = null, esc = false, close = -1
  for (let j = braceAt; j < out.length; j++) {
    const c = out[j]
    if (inS) {
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === inS) inS = null
      continue
    }
    if (c === '"' || c === "'") { inS = c; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { close = j; break } }
  }
  if (close < 0) throw new Error('L10N.ja 未配平')

  const body = out.slice(braceAt, close)
  // ★去重正则必须允许**引号前缀**（ja 表的键写成 "甲": "乙"），否则恒判缺失 ⇒ 重复插入。
  const need = Object.entries(fill.inline).filter(([k]) => {
    const e = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp('(?:^|[\\s{,"\'])("?)\\s*' + e + '\\s*\\1\\s*:').test(body)
  })
  if (!need.length) console.log('L10N: 无需新增')
  else {
    const block = need.map(([k, v]) => '  ' + q(k) + ': ' + q(v) + ',').join(EOL)
    const prev = out.slice(0, close).replace(/[ \t]+$/, '')
    const sep = /,\s*$/.test(prev) ? '' : ','
    out = out.slice(0, close) + sep + EOL + block + EOL + out.slice(close)
    console.log('L10N: 新增 ' + need.length + ' 条')
  }
}

// ── 断言 ────────────────────────────────────────────────────
const crlf0 = (src.match(/\r\n/g) || []).length
const crlf1 = (out.match(/\r\n/g) || []).length
const lf0 = (src.match(/\n/g) || []).length
const lf1 = (out.match(/\n/g) || []).length
if (crlf1 <= crlf0) throw new Error(`CRLF 未增长: ${crlf0} -> ${crlf1}`)
if (lf1 !== crlf1) throw new Error(`裸 LF 非 0: ${lf1 - crlf1}`)
if (lf0 !== crlf0) throw new Error('原文件本就不是纯 CRLF')

writeFileSync(P, out)
console.log(`CRLF ${crlf0} -> ${crlf1} (+${crlf1 - crlf0})  裸LF ${lf1 - crlf1}`)
console.log('sha16 前 ' + createHash('sha256').update(src).digest('hex').slice(0, 16).toUpperCase())
console.log('sha16 后 ' + createHash('sha256').update(out).digest('hex').slice(0, 16).toUpperCase())
