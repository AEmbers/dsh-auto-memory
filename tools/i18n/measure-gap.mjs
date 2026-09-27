/**
 * 只读度量：ja 覆盖缺口
 *   A. 字典层：I18N.zh 的键中，I18N.ja 缺哪些（t() 通路）
 *   B. 内联层：源码里 L('甲','乙') 的「甲」中，L10N.ja 缺哪些（L() 通路）
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire('D:/dsh-auto-memory/package.json')
const acorn = require('acorn')
const SRC = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')
const ast = acorn.parse(SRC, { ecmaVersion: 2022 })
const sliceOf = (n) => SRC.slice(n.start, n.end)

function findTop(node, pred, out = []) {
  if (!node || typeof node.type !== 'string') return out
  if (pred(node)) out.push(node)
  for (const k of Object.keys(node)) {
    const v = node[k]
    if (Array.isArray(v)) v.forEach((x) => x && x.type && findTop(x, pred, out))
    else if (v && v.type) findTop(v, pred, out)
  }
  return out
}

const i18nN = findTop(ast, (n) => n.type === 'VariableDeclarator' && n.id && n.id.name === 'I18N')[0]
const l10nN = findTop(ast, (n) => n.type === 'VariableDeclarator' && n.id && n.id.name === 'L10N')[0]
const i18nAssigns = findTop(
  ast,
  (n) => n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'AssignmentExpression' &&
    n.expression.left && n.expression.left.type === 'MemberExpression' &&
    n.expression.left.object && n.expression.left.object.name === 'I18N',
)

const code = [
  'var I18N = (' + sliceOf(i18nN.init) + ');',
  ...i18nAssigns.map((n) => sliceOf(n) + ';'),
  'var L10N = (' + sliceOf(l10nN.init) + ');',
  'globalThis.__D = { I18N: I18N, L10N: L10N }',
].join('\n')
const sb = { console }; sb.globalThis = sb
vm.runInContext(code, vm.createContext(sb), { filename: 'client.js#dict' })
const { I18N, L10N } = sb.__D

const zhK = Object.keys(I18N.zh || {}), jaK = new Set(Object.keys(I18N.ja || {}))
const enK = new Set(Object.keys(I18N.en || {}))
const missDict = zhK.filter((k) => !jaK.has(k))

// 内联层：全部 L( 'literal' , 'literal' ) 的第一参
const inlineFirst = new Set()
const RE = /(?<![\w.$])L\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)/g
let m
while ((m = RE.exec(SRC))) {
  let s = m[1]
  try { s = JSON.parse(s.startsWith("'") ? '"' + s.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"' : s) } catch { /* 保留原样 */ }
  inlineFirst.add(s)
}
const jaInline = L10N.ja || {}
const missInline = [...inlineFirst].filter((k) => jaInline[k] === undefined)

console.log('===== A. 字典层（t() 通路）=====')
console.log(`I18N.zh=${zhK.length}  I18N.en=${enK.size}  I18N.ja=${jaK.size}`)
console.log(`ja 缺键 = ${missDict.length}`)
if (missDict.length) console.log('  ' + missDict.slice(0, 40).join('\n  '))
console.log(`  ✗ 其中 en 有而 ja 无（真缺口，需补）= ${missDict.filter((k) => enK.has(k)).length}`)

console.log('\n===== B. 内联层（L() 通路）=====')
console.log(`源码内联中文串（L 第一参去重）= ${inlineFirst.size}`)
console.log(`L10N.ja 已有 = ${Object.keys(jaInline).length}`)
console.log(`ja 缺译 = ${missInline.length}`)
if (missInline.length) console.log('  ' + missInline.slice(0, 40).map((s) => JSON.stringify(s)).join('\n  '))
