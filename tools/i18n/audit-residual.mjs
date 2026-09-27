/**
 * 只读：判定 24 处 props 函数之外的 `zh`/`locale === 'zh'` 三元点，
 * 其作用域里的 `zh` 究竟绑定到什么（全局 locale / props / 参数）。
 */
import { readFileSync } from 'node:fs'

const lines = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8').split('\r\n')

const targets = []
lines.forEach((l, i) => {
  const bare = /(?<![\w.$])zh \?/.test(l)
  const loc = /locale === 'zh' \?/.test(l)
  if (bare || loc) targets.push({ i, bare, loc })
})

function ownerOf(i) {
  for (let k = i; k >= 0 && k > i - 400; k--) {
    if (/^\s*function\s+[A-Za-z0-9_$]+\s*\(/.test(lines[k]) || /^\s*(?:var|let|const)\s+[A-Za-z0-9_$]+\s*=\s*function/.test(lines[k])) {
      // 找该函数自己的 zh 绑定（在它之前最近处）
      return { fnLine: k, fnName: (lines[k].match(/function\s+([A-Za-z0-9_$]+)/) || [, '?'])[1] }
    }
  }
  return { fnLine: -1, fnName: '?' }
}

function zhBindingOf(fnLine, i) {
  // 在函数体内、目标行之前，找最近的 zh 定义或形参
  for (let k = i - 1; k >= Math.max(0, fnLine); k--) {
    if (/(?:var|let|const)\s+zh\s*=/.test(lines[k])) return lines[k].trim().slice(0, 110)
    if (/function\s+[A-Za-z0-9_$]+\s*\([^)]*\bzh\b/.test(lines[k])) return '形参 zh: ' + lines[k].trim().slice(0, 100)
  }
  // 再看是否用了外层/全局 locale
  return ''
}

const rows = []
for (const t of targets) {
  const o = ownerOf(t.i)
  const bind = zhBindingOf(o.fnLine, t.i)
  rows.push({ L: t.i + 1, fn: o.fnName, bind })
}

const byBind = new Map()
for (const r of rows) {
  const key = r.bind ? r.bind.replace(/\s+/g, ' ').slice(0, 90) : '（作用域内无 zh 定义 ⇒ 疑为全局/外层）'
  if (!byBind.has(key)) byBind.set(key, [])
  byBind.get(key).push(r)
}

console.log('props 函数之外的残留三元点 =', rows.length)
console.log('')
for (const [bind, list] of byBind) {
  console.log('■ 绑定: ' + bind)
  console.log('   点: ' + list.map((r) => 'L' + r.L + '(' + r.fn + ')').join(', '))
  console.log('')
}
