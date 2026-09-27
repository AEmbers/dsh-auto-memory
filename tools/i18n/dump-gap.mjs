/**
 * 只读：导出 ja 缺口清单到 tools/i18n/gap.json
 *   missDict   —— I18N.zh 有而 I18N.ja 缺的键（t() 通路），并附英文对照
 *   missInline —— 源码 L('甲','乙') 的「甲」中，L10N.ja 缺的（L() 通路），并附英文对照
 */
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire('D:/dsh-auto-memory/package.json')
const acorn = require('acorn')
const SRC = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')
const ast = acorn.parse(SRC, { ecmaVersion: 2022 })
const sl = (n) => SRC.slice(n.start, n.end)

function ft(n, p, o = []) {
  if (!n || typeof n.type !== 'string') return o
  if (p(n)) o.push(n)
  for (const k of Object.keys(n)) {
    const v = n[k]
    if (Array.isArray(v)) v.forEach((x) => x && x.type && ft(x, p, o))
    else if (v && v.type) ft(v, p, o)
  }
  return o
}

const i18nN = ft(ast, (n) => n.type === 'VariableDeclarator' && n.id && n.id.name === 'I18N')[0]
const l10nN = ft(ast, (n) => n.type === 'VariableDeclarator' && n.id && n.id.name === 'L10N')[0]
const asg = ft(ast, (n) => n.type === 'ExpressionStatement' && n.expression &&
  n.expression.type === 'AssignmentExpression' && n.expression.left &&
  n.expression.left.type === 'MemberExpression' &&
  n.expression.left.object && n.expression.left.object.name === 'I18N')

const code = [
  'var I18N = (' + sl(i18nN.init) + ');',
  ...asg.map((n) => sl(n) + ';'),
  'var L10N = (' + sl(l10nN.init) + ');',
  'globalThis.__D = { I18N: I18N, L10N: L10N }',
].join('\n')
const sb = { console }; sb.globalThis = sb
vm.runInContext(code, vm.createContext(sb), { filename: 'client.js#gap' })
const { I18N, L10N } = sb.__D

const zh = I18N.zh || {}, en = I18N.en || {}, ja = I18N.ja || {}
const missDict = Object.keys(zh).filter((k) => ja[k] === undefined)

// 内联层：正则扫源码（只取两参均为字符串字面量的 L(...)）
const RE = /(?<![\w.$])L\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)/g
const pairs = []
let m
while ((m = RE.exec(SRC))) {
  const unq = (t) => (t[0] === "'" ? t.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\') : JSON.parse(t))
  pairs.push([unq(m[1]), unq(m[2])])
}
const jaInline = L10N.ja || {}
const uniq = new Map()
for (const [a, b] of pairs) if (!uniq.has(a)) uniq.set(a, b)
const missInline = [...uniq.entries()].filter(([a]) => jaInline[a] === undefined)

writeFileSync(
  'D:/dsh-auto-memory/tools/i18n/gap.json',
  JSON.stringify(
    {
      counts: {
        zhKeys: Object.keys(zh).length,
        enKeys: Object.keys(en).length,
        jaKeys: Object.keys(ja).length,
        l10nJa: Object.keys(jaInline).length,
        inlineUnique: uniq.size,
        missDict: missDict.length,
        missInline: missInline.length,
      },
      missDict: missDict.map((k) => ({ key: k, en: en[k] })),
      missInline: missInline.map(([a, b]) => ({ zh: a, en: b })),
    },
    null,
    1,
  ),
  'utf8',
)

console.log(JSON.stringify({
  zhKeys: Object.keys(zh).length, enKeys: Object.keys(en).length, jaKeys: Object.keys(ja).length,
  l10nJa: Object.keys(jaInline).length, inlineUnique: uniq.size,
  missDict: missDict.length, missInline: missInline.length,
}, null, 1))
console.log('→ tools/i18n/gap.json')
