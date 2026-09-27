/**
 * 回改（修回归）：props 驱动语言的 7 个组件里，L(甲,乙) → zh ? 甲 : 乙。
 *
 * 背景：`var zh = props.zh !== false` 是**组件 props**，不是全局 locale。
 * patch2 把这类组件中的内联文案也改成了 L(...)，而 L() 读全局 locale
 * ⇒ `props.zh: false` 不再切英文（r27 B8 实测捕获）。
 *
 * 范围：只在下列 7 个函数的**花括号配平区间**内替换，且只替换「参数为两个字符串字面量」
 * 的 L(...) 调用（不含嵌套括号的场景一律报错退出，宁可漏改不可改错）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const P = 'D:/dsh-auto-memory/lib/client.js'
const src = readFileSync(P, 'utf8')
const lines = src.split('\n') // 保留 \r

const FNS = [
  [4081, 'DamRailToolbar'],
  [4157, 'DamFoldBar'],
  [4193, 'DamRailPanel'],
  [4293, 'DamTimelineCard'],
  [4356, 'DamTimelineList'],
  [4382, 'KanbanBoardRail'],
  [4643, 'KanbanMatrixCard'],
]

// 花括号配平求函数体结束行（0 基）
function span(start) {
  let d = 0, seen = false
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { d++; seen = true } else if (ch === '}') d--
    }
    if (seen && d === 0) return i
  }
  throw new Error('未配平 @' + start)
}

// 只匹配 L('...', '...') / L("...", "...")，两参均为纯字符串字面量
const RE = /(?<![\w.$])L\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)/g

let totalRepl = 0
const perFn = []

for (const [ln, name] of FNS) {
  const end = span(ln - 1)
  let n = 0
  for (let i = ln; i <= end; i++) {
    const before = lines[i]
    lines[i] = lines[i].replace(RE, (_m, a, b) => { n++; return `zh ? ${a} : ${b}` })
    if (lines[i] !== before) { /* ok */ }
  }
  totalRepl += n
  perFn.push(`  ${name}: 回改 ${n} 处`)
}

console.log(perFn.join('\n'))
console.log('合计回改:', totalRepl)

const out = lines.join('\n')
if (out === src) { console.log('无变化，退出'); process.exit(0) }

// 断言：CRLF 数不变（只做行内替换，不增删换行）
const c0 = (src.match(/\r\n/g) || []).length
const c1 = (out.match(/\r\n/g) || []).length
if (c0 !== c1) throw new Error(`CRLF 数变化：${c0} -> ${c1}`)

// 断言：全文件 L( 调用数应恰好减少 totalRepl
const l0 = (src.match(/(?<![\w.$])L\(/g) || []).length
const l1 = (out.match(/(?<![\w.$])L\(/g) || []).length
if (l0 - l1 !== totalRepl) throw new Error(`L( 数变化不符：${l0} -> ${l1}，期望 -${totalRepl}`)

// 断言：无裸 LF
const bare0 = c0 === (src.match(/\n/g) || []).length
const bare1 = c1 === (out.match(/\n/g) || []).length
if (!bare0 || !bare1) throw new Error(`裸 LF 非 0：前=${!bare0} 后=${!bare1}`)

console.log('CRLF', c0, '->', c1, '(不变)')
console.log('L( 调用', l0, '->', l1, `(-${totalRepl})`)
console.log('sha16 前', createHash('sha256').update(src).digest('hex').slice(0, 16).toUpperCase())
writeFileSync(P, out)
console.log('sha16 后', createHash('sha256').update(out).digest('hex').slice(0, 16).toUpperCase())
