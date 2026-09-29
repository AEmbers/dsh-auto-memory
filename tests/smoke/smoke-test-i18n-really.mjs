/**
 * 多语言功能验收（真执行，非源码字符串断言）
 *
 * 做法：用 acorn 从 lib/client.js 的 factory 源码中**抽取真实定义**
 *   - `function L(a, b)`
 *   - `function L3(a, b, ja)`
 *   - `var L10N = {...}`（第三语言查表）
 *   - `var I18N = {...}`（字典）
 *   - `function normLocale(v)`
 * 在 vm 里组装成可执行上下文，再**真调用**并断言返回值。
 *
 * 负路径：把字典删空 ⇒ ja 必须回落英文；未知语言 ⇒ 回落英文；zh ⇒ 恒取中文。
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const acorn = require('acorn')

const SRC = readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8')

let pass = 0, fail = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m) } }

// ── 用 acorn 定位真实定义节点 ──────────────────────────────
const ast = acorn.parse(SRC, { ecmaVersion: 2022 })
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
const sliceOf = (n) => SRC.slice(n.start, n.end)

const lFnN = findTop(ast, (n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'L')
const l3FnN = findTop(ast, (n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'L3')
const nlFnN = findTop(ast, (n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'normLocale')
const l10nN = findTop(ast, (n) => n.type === 'VariableDeclarator' && n.id && n.id.name === 'L10N')
const i18nN = findTop(ast, (n) => n.type === 'VariableDeclarator' && n.id && n.id.name === 'I18N')
const localeAllN = findTop(ast, (n) => n.type === 'VariableDeclarator' && n.id && n.id.name === 'LOCALE_ALL')
// ★I18N.<lang> = {...} 是**字面量之后的独立赋值语句**（不是 `var I18N = {ja:{...}}` 的嵌套属性），
//   acorn 取 init 拿不到 ⇒ 必须把顶层赋值语句一并抄进来，否则 I18N.ja 恒为 0 键。
const i18nAssigns = findTop(
  ast,
  (n) =>
    n.type === 'ExpressionStatement' &&
    n.expression &&
    n.expression.type === 'AssignmentExpression' &&
    n.expression.left &&
    n.expression.left.type === 'MemberExpression' &&
    n.expression.left.object &&
    n.expression.left.object.name === 'I18N',
)

ok(lFnN.length === 1, `恰好 1 个 function L(a, b) 定义（实测 ${lFnN.length}）`)
ok(nlFnN.length >= 1, `存在 normLocale 定义（实测 ${nlFnN.length}）`)
ok(l10nN.length === 1, `恰好 1 个 var L10N（实测 ${l10nN.length}）`)
ok(i18nN.length === 1, `恰好 1 个 var I18N（实测 ${i18nN.length}）`)
ok(localeAllN.length === 1, `恰好 1 个 var LOCALE_ALL（实测 ${localeAllN.length}）`)
ok(i18nAssigns.length >= 1, `存在 I18N.<lang> 独立赋值（实测 ${i18nAssigns.length} 条：` +
  i18nAssigns.map((n) => sliceOf(n.expression.left)).join(',') + '）')

// ── 在 vm 里真执行这些定义 ────────────────────────────────
const code = [
  'var locale = "zh";',
  // ★对象字面量必须包在括号里当表达式，否则 `{zh:{...}}` 会被解析成块 + label（实测报 Unexpected token ':'）
  'var LOCALE_ALL = ' + sliceOf(localeAllN[0].init) + ';',
  'var L10N = (' + sliceOf(l10nN[0].init) + ');',
  'var I18N = (' + sliceOf(i18nN[0].init) + ');',
  // ★I18N.ja 等是独立赋值语句，必须逐条抄回
  ...i18nAssigns.map((n) => sliceOf(n) + ';'),
  sliceOf(lFnN[0]),
  l3FnN.length ? sliceOf(l3FnN[0]) : 'function L3(a,b,ja){ return L(a,b) }',
  sliceOf(nlFnN[0]),
  'globalThis.__T = { L: L, L3: L3, normLocale: normLocale, L10N: L10N, I18N: I18N, setLoc: function(v){ locale = v } }',
].join('\n')

const sb = { console }
sb.globalThis = sb
let T = null
try {
  vm.runInContext(code, vm.createContext(sb), { filename: 'client.js#i18n' })
  T = sb.__T
  ok(true, '★抽取片段在 vm 中真执行成功（无 ReferenceError / SyntaxError）')
} catch (e) {
  ok(false, '抽取片段真执行失败: ' + e.message)
}

if (T) {
  // ① zh ⇒ 恒取中文
  T.setLoc('zh')
  ok(T.L('记忆', 'Memory') === '记忆', "L zh ⇒ 中文（'记忆'）")

  // ② en ⇒ 取英文
  T.setLoc('en')
  ok(T.L('记忆', 'Memory') === 'Memory', "L en ⇒ 英文（'Memory'）")

  // ③ ja：字典命中的键 ⇒ 日文，且**不等于**中文
  T.setLoc('ja')
  const jaKeys = Object.keys(T.L10N.ja || {})
  ok(jaKeys.length > 300, `L10N.ja 条目数 ${jaKeys.length} > 300`)
  const sample = jaKeys.find((k) => (T.I18N.ja || {})[k] === undefined) || jaKeys[0]
  const got = T.L(sample, 'EN-FALLBACK')
  ok(got !== 'EN-FALLBACK', `L ja 命中字典 ⇒ 非英文回落（key=${JSON.stringify(sample).slice(0, 30)} ⇒ ${JSON.stringify(got).slice(0, 30)}）`)
  ok(got !== sample || T.L10N.ja[sample] === sample, `L ja 值来自 L10N.ja（key=${JSON.stringify(sample).slice(0, 30)}）`)

  // ④ 负路径：字典里没有的键 ⇒ 回落英文
  const missing = '__NOPE__' + Date.now()
  ok(T.L(missing, 'FALLBACK') === 'FALLBACK', 'L ja 未命中 ⇒ 回落英文（负路径）')

  // ⑤ 负路径：把字典掏空 ⇒ 全部回落英文
  const backup = T.L10N.ja
  T.L10N.ja = {}
  ok(T.L('记忆', 'Memory') === 'Memory', 'L ja 空字典 ⇒ 回落英文（负路径）')
  T.L10N.ja = backup

  // ⑥ 未知语言 ⇒ 回落英文
  T.setLoc('fr')
  ok(T.L('记忆', 'Memory') === 'Memory', 'L 未知语言 fr ⇒ 回落英文（负路径）')
  ok(T.normLocale('fr') === '', "normLocale('fr') ⇒ ''（未知语言，负路径）")

  // ⑦ normLocale 归一化真实取值
  ok(T.normLocale('ja-JP') === 'ja', "normLocale('ja-JP') ⇒ 'ja'")
  ok(T.normLocale('ja_JP') === 'ja', "normLocale('ja_JP') ⇒ 'ja'")
  ok(T.normLocale('zh-CN') === 'zh', "normLocale('zh-CN') ⇒ 'zh'")
  ok(T.normLocale('en-US') === 'en', "normLocale('en-US') ⇒ 'en'")
  ok(T.normLocale('') === '', "normLocale('') ⇒ ''")
  ok(T.normLocale(null) === '', 'normLocale(null) ⇒ \'\'（不崩）')

  // ⑧ L3 逃生舱
  T.setLoc('ja')
  ok(T.L3('甲', 'Yi', 'コウ') === 'コウ', 'L3 ja ⇒ 第三参')
  T.setLoc('zh')
  ok(T.L3('甲', 'Yi', 'コウ') === '甲', 'L3 zh ⇒ 第一参')
  T.setLoc('en')
  ok(T.L3('甲', 'Yi', 'コウ') === 'Yi', 'L3 en ⇒ 第二参')

  // ⑨ 字典规模（真计数）
  const zhN = Object.keys(T.I18N.zh || {}).length
  const enN = Object.keys(T.I18N.en || {}).length
  const jaN = Object.keys(T.I18N.ja || {}).length
  console.log(`  I18N.zh=${zhN} I18N.en=${enN} I18N.ja=${jaN} L10N.ja=${jaKeys.length}`)
  ok(jaN > 500, `I18N.ja 键数 ${jaN} > 500`)
  ok(enN >= zhN - 5, `I18N.en(${enN}) 不显著少于 zh(${zhN})`)
}

console.log(fails.map((f) => '  FAIL: ' + f).join('\n'))
console.log(`\n[i18n-really] PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
