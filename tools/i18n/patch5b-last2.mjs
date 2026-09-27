/**
 * 补最后 2 条 ja 内联译文。
 * 前一次 patch5 把这两条判成「已存在」而跳过 —— 去重正则的前缀字符类
 * 允许空白/引号，误匹配到了 `" 成功XX": ...` 这类**同前缀的其他键**。
 * 这里改用**完整引号键**精确匹配：`"成功":`。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const P = 'D:/dsh-auto-memory/lib/client.js'
const EXTRA = { 成功: '成功', 会话: 'セッション' }

let s = readFileSync(P, 'utf8')

const outer = s.indexOf('var L10N')
if (outer < 0) throw new Error('找不到 var L10N')
const jaKey = s.indexOf('ja', outer)
const braceAt = s.indexOf('{', jaKey)
if (braceAt < 0) throw new Error('ja 后无 `{`')

let depth = 0, inS = null, esc = false, close = -1
for (let j = braceAt; j < s.length; j++) {
  const c = s[j]
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

const body = s.slice(braceAt, close)
const need = Object.entries(EXTRA).filter(([k]) => !body.includes('"' + k + '":'))
console.log('待补:', need.map((x) => x[0]).join(',') || '(无)')

if (need.length) {
  const blk = need.map(([k, v]) => '  "' + k + '": "' + v + '",').join('\r\n')
  const prev = s.slice(0, close).replace(/[ \t]+$/, '')
  const sep = /,\s*$/.test(prev) ? '' : ','
  s = s.slice(0, close) + sep + '\r\n' + blk + '\r\n' + s.slice(close)
  writeFileSync(P, s)
  console.log('已补 ' + need.length + ' 条')
}
