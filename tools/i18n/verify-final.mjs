/**
 * 收口核验（只读）：
 *  A. 所有残留 `(zh ? …)` / `locale === 'zh' ? …` 是否都落在 **props 驱动语言** 的函数体内
 *     （这些函数的 `zh` 来自 props.zh，不是全局 locale ⇒ 保留三元是正确语义）
 *  B. 语言选择器的 option 标签键（zh / en / ja）是否在 I18N 字典里齐备
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SRC = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')
const lines = SRC.split('\r\n')

// ── 动态定位：所有 `var zh = props.zh` 所在函数体 ──
const declIdx = []
lines.forEach((l, i) => { if (/var zh = props\.zh/.test(l)) declIdx.push(i) })

function fnStartOf(i) {
  for (let k = i; k >= 0 && k > i - 60; k--) {
    if (/^\s*function\s+[A-Za-z0-9_$]+\s*\(/.test(lines[k])) return k
  }
  return -1
}
function fnEndOf(start) {
  let d = 0, seen = false
  for (let i = start; i < lines.length; i++) {
    for (const c of lines[i]) { if (c === '{') { d++; seen = true } else if (c === '}') d-- }
    if (seen && d === 0) return i
  }
  return start
}
const propsFns = declIdx.map((i) => {
  const s = fnStartOf(i)
  const name = (lines[s].match(/function\s+([A-Za-z0-9_$]+)/) || [, '?'])[1]
  return { name, start: s, end: fnEndOf(s) }
})

// ── A. 逐个残留点判定归属 ──
const hits = []
lines.forEach((l, i) => {
  if (/\(zh \?/.test(l) || /locale === 'zh' \?/.test(l)) hits.push(i)
})
const inside = [], outside = []
for (const i of hits) {
  const owner = propsFns.find((f) => i >= f.start && i <= f.end)
  if (owner) inside.push({ i, fn: owner.name })
  else outside.push({ i, text: lines[i].trim().slice(0, 120) })
}

console.log('=== A. props 驱动函数（' + propsFns.length + ' 个）===')
console.log(propsFns.map((f) => '  ' + f.name + '  L' + (f.start + 1) + '-L' + (f.end + 1)).join('\n'))
console.log('\n残留三元点合计 =', hits.length)
console.log('  落在 props 驱动函数内（语义正确，保留）=', inside.length)
console.log('  落在外部（需为 0）=', outside.length)
outside.forEach((o) => console.log('    ✗ L' + (o.i + 1) + ': ' + o.text))

// ── B. 语言选择器标签键齐备性 ──
const i18nMatch = SRC.match(/var I18N = \{[\s\S]*?\n\}/)
const i18nAssigns = [...SRC.matchAll(/I18N\.(\w+) = \{/g)].map((m) => m[1])
const sb = { console }; sb.globalThis = sb
let I18N = null
try {
  const code = (i18nMatch ? i18nMatch[0].replace('var I18N = {', 'var I18N = ({') + ')' : 'var I18N = {}') + ';globalThis.__I = I18N'
  vm.runInContext(code, vm.createContext(sb), { filename: 'i18n-base' })
  I18N = sb.__I
} catch (e) { console.log('基字典解析失败: ' + e.message) }

console.log('\n=== B. 语言选择器标签键 ===')
console.log('  字典语言档（I18N.<lang> 赋值）=', i18nAssigns.join(', '))
if (I18N) {
  for (const k of ['zh', 'en', 'ja']) {
    const v = I18N[k] && I18N[k][k]
    console.log(`  t('${k}') => ` + (v === undefined ? '✗ 缺失' : JSON.stringify(v)))
  }
  const base = Object.keys(I18N)
  console.log('  I18N 顶层键 =', base.join(', '))
}
