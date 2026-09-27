/**
 * 阶段 3/3：适配既有守卫到 L() 形态
 *
 * 两类改动：
 *  A. 9 套 vm 抽段套件的沙箱缺 L/L3/normLocale 桩 ⇒ 注入「按中文原串直返」的桩，
 *     使 ja 档行为可在沙箱内断言（桩本身也接受第二参英文）。
 *  B. 4 套静态断言锁死旧源码形态 ⇒ 放宽为**形态无关**：
 *     同时接受 `locale === 'zh' ? A : B` 与 `L(A, B)`，以后加语言不用再改断言。
 *
 * 幂等：以 `__L_STUB__` 标记与断言内是否已含 `L\\(` 判定；已改则跳过。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = 'D:/dsh-auto-memory/tests/smoke'
const MARK = '__L_STUB__'
let changed = 0
const report = []

const patch = (file, edits) => {
  const p = path.join(DIR, file)
  const raw = readFileSync(p, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  let out = raw
  const notes = []
  for (const ed of edits) {
    if (ed.test(out)) { notes.push(ed.name + ': 已符合，跳过'); continue }
    const n = out.split(ed.anchor).length - 1
    if (n !== ed.expect) throw new Error(`${file} / ${ed.name}: 锚点命中 ${n} 次（期望 ${ed.expect}）`)
    out = ed.apply(out)
    notes.push(ed.name + ': 已改')
  }
  if (out !== raw) {
    if ((out.match(/\r\n/g) || []).length !== (raw.match(/\r\n/g) || []).length + (edits.some((e) => e.name.includes('注入')) ? 0 : 0)) { /* CRLF 允许随插入同步增长 */ }
    writeFileSync(p, out)
    changed++
  }
  report.push(`  ${file}: ${notes.join(' | ')}`)
}

// 共享桩源码（注入到各沙箱对象里）
const STUB = `/* ${MARK} 多语言桩：L 内联两参（中文/英文）；第三语言档由 L10N 提供，缺失回落英文 */\n  __L10N: {},\n  L: function (a, b) { var m = this.__L10N && this.__L10N[this.locale]; if (this.locale === 'zh') return a; if (m && m[a] !== undefined) return m[a]; return b === undefined ? a : b },\n  L3: function (a, b, ja) { if (this.locale === 'zh') return a; if (this.locale === 'ja' && ja !== undefined) return ja; return this.L(a, b) },\n  normLocale: function (v) { v = String(v == null ? '' : v).toLowerCase(); if (!v) return ''; for (var i = 0; i < ['zh','en','ja'].length; i++) { var k = ['zh','en','ja'][i]; if (v === k || v.indexOf(k + '-') === 0 || v.indexOf(k + '_') === 0) return k } return '' },\n`

// ── A. 沙箱注入桩 ──
const sandboxEdits = (anchorLine) => ([{
  name: '注入 L 桩',
  anchor: anchorLine,
  expect: 1,
  test: (s) => s.includes(MARK),
  apply: (s) => s.replace(anchorLine, anchorLine + '\n' + STUB.trimEnd()),
}])

// 单行对象字面量形态：在 `locale: 'zh',` 后插入
const LOCALE_ANCHORS = [
  "const sb = { console: console, h: h, locale: 'zh', Date: Date, useState: (v) => [v, function () {}],",
  "const sandbox = { console, h, locale: 'zh', String, Object, Array, JSON, Date, useTick: () => [0, () => {}], apiGet: () => Promise.resolve(null), API: {}, useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect: () => {} }",
]

// A1: r18 / r19 —— 在 sb 字面量首行后插桩
for (const f of ['smoke-test-r18-fe02-screens.mjs', 'smoke-test-r19-fe02-screens2.mjs']) {
  patch(f, [{
    name: '注入 L 桩',
    anchor: "  useTick: () => [0, function () {}], useEffect: () => {}, apiGet: () => Promise.resolve(null), API: { state: '/state' }, t: (k) => k, fmtAgoShort: (ms) => (ms ? String(ms) : ''),",
    expect: f.includes('r18') ? 1 : 0,
    test: (s) => s.includes(MARK),
    apply: (s) => s.replace(
      "  useTick: () => [0, function () {}], useEffect: () => {}, apiGet: () => Promise.resolve(null), API: { state: '/state' },",
      "  useTick: () => [0, function () {}], useEffect: () => {}, apiGet: () => Promise.resolve(null), API: { state: '/state' },\n" + STUB.trimEnd() + "\n  t: (k) => k,"),
  }])
}

console.log(report.join('\n'))
console.log('changed:', changed)
