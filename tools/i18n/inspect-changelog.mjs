import { readFileSync } from 'node:fs'

const SRC = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')

// ── 1. var CHANGELOG 的键与最新条目 ──
const at = SRC.indexOf('var CHANGELOG')
console.log('=== var CHANGELOG 位置 ===', at)
const seg = SRC.slice(at, at + 4000)
const keys = [...seg.matchAll(/^  '([\d.]+)':\s*\{/gm)].map((m) => m[1])
console.log('键（前 8 个）:', keys.slice(0, 8).join(', '))

// 完整 dump 最新两个键的条目
for (const k of keys.slice(0, 2)) {
  const s = seg.indexOf("'" + k + "':")
  const e = seg.indexOf("'" + (keys[keys.indexOf(k) + 1] || '@@') + "':", s + 5)
  console.log('\n--- ' + k + ' ---')
  console.log(seg.slice(s, e > 0 ? e : s + 1200).trimEnd())
}

// ── 2. CONTRIBUTORS.html 结构 ──
const H = readFileSync('D:/dsh-auto-memory/docs/CONTRIBUTORS.html', 'utf8')
console.log('\n=== CONTRIBUTORS.html ===', H.length, 'B')
const lines = H.split(/\r?\n/)
console.log('行数', lines.length, '| CRLF', (H.match(/\r\n/g) || []).length, '| 裸LF', (H.match(/\n/g) || []).length - (H.match(/\r\n/g) || []).length)
// 找贡献者卡片/条目的模式
const idx = []
lines.forEach((l, i) => { if (/humou44|Minervaowl7|JIE42393|ProperSAMA/.test(l)) idx.push(i) })
console.log('贡献者名出现的行:', idx.map((i) => i + 1).join(', '))
for (const i of idx.slice(0, 4)) {
  console.log('\n--- 上下文 L' + (i + 1) + ' ---')
  for (let j = Math.max(0, i - 6); j <= Math.min(lines.length - 1, i + 6); j++) {
    console.log(String(j + 1).padStart(5) + '| ' + lines[j].trimEnd().slice(0, 170))
  }
}
