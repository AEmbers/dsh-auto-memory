/**
 * 只读：统计哪些 vm 抽段套件会因 L/L3/normLocale 缺失而炸。
 * 判定：套件把 client.js 的源码片段抽进 vm 沙箱执行，
 *       且该片段里出现了 L( / L3( / normLocale( 调用，
 *       但沙箱对象里没有对应桩 ⇒ 运行时 ReferenceError。
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = 'D:/dsh-auto-memory/tests/smoke'
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort()

const NEEDLE = /(?<![\w.$])(L3?|normLocale)\s*\(/g
const hasStub = (src, name) => new RegExp('\\b' + name + '\\s*:').test(src) || new RegExp('function\\s+' + name + '\\b').test(src)

const rows = []
for (const f of files) {
  const src = readFileSync(path.join(DIR, f), 'utf8')
  const isVm = /vm\.runInContext|createContext/.test(src)
  if (!isVm) continue
  // 该套件是否直接抽 client.js 片段
  const readsClient = /client\.js/.test(src)
  if (!readsClient) continue
  const used = new Set()
  let m
  const re = new RegExp(NEEDLE.source, 'g')
  while ((m = re.exec(src))) used.add(m[1])
  if (!used.size) continue
  const missing = [...used].filter((n) => !hasStub(src, n))
  rows.push({ f, used: [...used].join(','), missing: missing.join(',') })
}
console.log('vm 抽段且用到 L/L3/normLocale 的套件:', rows.length)
console.log('')
console.log('文件'.padEnd(46), '用到'.padEnd(18), '缺桩')
for (const r of rows) console.log(r.f.padEnd(46), r.used.padEnd(18), r.missing || '(无)')
console.log('')
const need = rows.filter((r) => r.missing)
console.log('★需要补桩的套件数:', need.length)
console.log(need.map((r) => r.f).join('\n'))
