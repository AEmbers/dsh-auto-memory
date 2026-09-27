import { readFileSync } from 'node:fs'

const SRC = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')

// ── 1. var CHANGELOG 头部原样 ──
const at = SRC.indexOf('var CHANGELOG')
console.log('=== var CHANGELOG @ offset ' + at + ' ===')
console.log(JSON.stringify(SRC.slice(at, at + 260)))
console.log('\n--- 可读形式（前 40 行）---')
console.log(SRC.slice(at, at + 3000).split('\n').slice(0, 40).join('\n'))

// ── 2. 谁在用 CHANGELOG（渲染逻辑）──
console.log('\n=== CHANGELOG 引用点 ===')
const lines = SRC.split('\n')
lines.forEach((l, i) => {
  if (/\bCHANGELOG\b/.test(l)) console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 160))
})
