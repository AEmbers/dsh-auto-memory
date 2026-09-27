/**
 * 抽取 PR#143 的日语译文 → 种子 JSON（只读 git 对象，不碰工作树）
 * 产出：
 *   tools/i18n/seed-dict-ja.json   —— I18N.ja 字典键（561）
 *   tools/i18n/seed-inline-ja.json —— 内联 L3 第三参（中文源串 → 日文，367）
 */
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const acorn = require('D:/dsh-auto-memory/node_modules/acorn')

const REPO = 'D:/dsh-auto-memory'
const prSrc = execSync('git show refs/tmp/pr143:lib/client.js', { cwd: REPO, maxBuffer: 1 << 28 }).toString('utf8')
const ast = acorn.parse(prSrc, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
const nodes = []
;(function walk(n) {
  if (!n || typeof n !== 'object') return
  if (Array.isArray(n)) return n.forEach(walk)
  if (typeof n.type === 'string') nodes.push(n)
  for (const k of Object.keys(n)) if (!['type', 'start', 'end', 'loc', 'range'].includes(k)) walk(n[k])
})(ast)

// ---- 1. I18N.ja 字典（独立赋值形态）----
const dict = {}
for (const n of nodes) {
  if (n.type !== 'AssignmentExpression') continue
  const l = n.left
  if (!l || l.type !== 'MemberExpression' || !l.object || l.object.name !== 'I18N') continue
  if ((l.property.name || l.property.value) !== 'ja') continue
  if (n.right.type !== 'ObjectExpression') continue
  for (const p of n.right.properties) {
    if (p.type !== 'Property') continue
    const k = p.key ? (p.key.name || p.key.value) : null
    if (!k) continue
    const v = p.value
    if (v.type === 'Literal' && typeof v.value === 'string') dict[k] = v.value
    else if (v.type === 'TemplateLiteral' && v.expressions.length === 0) dict[k] = v.quasis[0].value.cooked
    else dict[k] = { __fn: true, src: prSrc.slice(v.start, v.end) }
  }
}

// ---- 2. 内联 L3 第三参 ----
const inline = {}
let l3count = 0
for (const n of nodes) {
  if (n.type !== 'CallExpression' || !n.callee || n.callee.name !== 'L3') continue
  l3count++
  const a = n.arguments
  if (a.length >= 3 && a[0].type === 'Literal' && a[2].type === 'Literal') inline[a[0].value] = a[2].value
}

mkdirSync(REPO + '/tools/i18n', { recursive: true })
writeFileSync(REPO + '/tools/i18n/seed-dict-ja.json', JSON.stringify(dict, null, 2))
writeFileSync(REPO + '/tools/i18n/seed-inline-ja.json', JSON.stringify(inline, null, 2))

const fnKeys = Object.entries(dict).filter(([, v]) => v && v.__fn).map(([k]) => k)
console.log('I18N.ja 种子键:', Object.keys(dict).length, '（其中函数型', fnKeys.length, '：' + fnKeys.join(',') + '）')
console.log('内联 ja 种子:', Object.keys(inline).length, '（PR 内 L3 调用共', l3count, '）')
console.log('已写 tools/i18n/seed-*.json')
