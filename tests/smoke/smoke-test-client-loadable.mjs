/**
 * client.js 运行时可加载性守卫（真执行 factory，不是静态断言）。
 *
 * ## 为什么需要它（2026-09-27 事故）
 * 一次「L1 token 化」重构把一行 CSS 字符串拆成多行时，手滑拼进了 " + CRLF"，
 * 而全文从未定义 `CRLF` 这个标识符 ⇒ 浏览器里 factory 抛 `ReferenceError: CRLF is not defined`，
 * 插件整体加载失败。但当时 **188 个套件全绿**，因为这个错误在静态层面完全不可见：
 *   - `node --check` 只做语法解析，未定义标识符是**运行时**错误，语法合法；
 *   - harness 在 `entry.fiber === void 0` 时只打印 "import failed (see console…)"，异常本体被吞；
 *   - 该异常没有进 renderer console（只收 error 级），所以连日志都看不到。
 * 实测：211 个套件里 53 个读 `client.js` 文本，**0 个**用 vm 沙箱执行 factory。
 * ⇒ 这是守卫体系的结构性缺口：**只有真跑一遍才看得见**。
 *
 * ## 本套件做什么
 * 用 vm 造一个最小宿主环境（console / window.__ModuleLoader__ / React 桩 / DOM 桩 / Storage 桩），
 * 把 client.js **原样编译并执行**，取出 `{ id, factory }`，再**真调用一次 factory**。
 * 只要 factory 抛任何异常（ReferenceError / TypeError / …），本套件即红。
 *
 * ## 判据（每条都带负路径）
 *  1 顶栏不抛异常，且 console.log 出现 fingerprint
 *  2 `__ModuleLoader__.load` 被调用且拿到 id + factory
 *  3 ★真调用 factory 不抛异常（这条就是当初漏掉的那条）
 *  4 factory 返回值形状正确（有 inject / apply）
 *  5 inject 是数组且含 slots
 *  6 [负路径] 故意构造一个引用未定义标识符的 factory ⇒ 同一判据必须捕到 ReferenceError
 *  7 [负路径] 故意构造一个语法错误文件 ⇒ 编译期必须抛
 *  8 源码里不得出现「引用了但从未定义的大写标识符」形态的拼接（CRLF 同型）
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC_PATH = path.join(ROOT, 'lib', 'client.js')
const SRC = readFileSync(SRC_PATH, 'utf8')

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok   - ' + msg) } else { fail++; console.log('  FAIL - ' + msg) } }

/** 造一个最小宿主环境，返回 { sandbox, loaded, logs } */
function makeSandbox () {
  const logs = []
  const loaded = []
  const noop = () => {}
  const mkEl = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: (c) => c, removeChild: noop, setAttribute: noop, getAttribute: () => null,
    removeAttribute: noop, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    insertBefore: noop, contains: () => false, focus: noop, blur: noop,
    firstChild: null, parentNode: null, children: [], textContent: '', innerHTML: '', value: '',
  })
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i) => Array.from(store.keys())[i] || null,
    get length () { return store.size },
  }
  const documentStub = {
    head: mkEl(), body: mkEl(), documentElement: mkEl(),
    createElement: mkEl, createElementNS: mkEl, createTextNode: () => mkEl(),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
    readyState: 'complete', cookie: '', title: '',
  }
  const React = {
    createElement: (type, props, ...kids) => ({ type, props: props || {}, children: kids }),
    useState: (v) => [typeof v === 'function' ? v() : v, noop],
    useEffect: noop, useReducer: (r, i) => [i, noop], useRef: (v) => ({ current: v }),
    useMemo: (f) => f(), useCallback: (f) => f, useContext: () => ({}), Fragment: 'Fragment',
    createContext: () => ({ Provider: 'Provider', Consumer: 'Consumer' }),
    memo: (c) => c, forwardRef: (f) => f, Children: { map: (a, f) => (a || []).map(f) },
  }
  const sandbox = {
    console: {
      log: (...a) => logs.push(['log', a.map(String).join(' ')]),
      warn: (...a) => logs.push(['warn', a.map(String).join(' ')]),
      error: (...a) => logs.push(['error', a.map(String).join(' ')]),
    },
    window: {
      __ModuleLoader__: { load: (entry) => loaded.push(entry) },
      addEventListener: noop, removeEventListener: noop, setTimeout, clearTimeout, setInterval, clearInterval,
      localStorage: storage, sessionStorage: storage,
      location: { href: 'http://localhost/', origin: 'http://localhost', search: '', hash: '' },
      navigator: { userAgent: 'node', language: 'zh' },
      matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
      requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
    },
    document: documentStub,
    localStorage: storage, sessionStorage: storage,
    navigator: { userAgent: 'node', language: 'zh' },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    TextEncoder, TextDecoder, URL, URLSearchParams,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  }
  sandbox.globalThis = sandbox
  sandbox.self = sandbox
  return { sandbox, loaded, logs, React }
}

/** 把源码跑起来，返回 { entry, logs, throwAt } —— throwAt 记录抛错阶段 */
function run (code, label) {
  const { sandbox, loaded, logs, React } = makeSandbox()
  const ctx = vm.createContext(sandbox)
  const out = { entry: null, logs, factoryOk: null, factoryErr: null, exports: null, topErr: null }
  try {
    new vm.Script(code, { filename: label + '.js' }).runInContext(ctx, { timeout: 20000 })
  } catch (e) { out.topErr = e; return out }
  out.entry = loaded[loaded.length - 1] || null
  if (!out.entry || typeof out.entry.factory !== 'function') return out
  try {
    out.exports = out.entry.factory((name) => {
      if (name === 'react') return React
      if (name === 'react-dom') return { createPortal: (n) => n }
      return {}
    })
    out.factoryOk = true
  } catch (e) { out.factoryErr = e }
  return out
}

console.log('== 1. 真执行 client.js 顶栏 ==')
const real = run(SRC, 'client')
ok(!real.topErr, '顶栏执行不抛异常' + (real.topErr ? ' -> ' + real.topErr.message : ''))
if (real.topErr) { console.log('        ' + (real.topErr.stack || '').split('\n').slice(0, 3).join('\n        ')) }
const fp = real.logs.filter((l) => l[1].includes('fingerprint'))
ok(fp.length > 0, 'console.log 打印了 fingerprint（顶栏确实跑到了）')
ok(real.logs.filter((l) => l[0] === 'error').length === 0, '顶栏无 console.error')

console.log('== 2. 拿到 __ModuleLoader__ 注册项 ==')
ok(!!real.entry, '__ModuleLoader__.load 被调用')
ok(real.entry && real.entry.id === '@a9i5k4/dsh-auto-memory', 'id 正确')
ok(real.entry && typeof real.entry.factory === 'function', 'factory 是函数')

console.log('== 3. ★真调用 factory（本命门：当初就是这里抛 ReferenceError） ==')
ok(real.factoryOk === true, 'factory 真调用不抛异常' + (real.factoryErr ? ' -> ' + real.factoryErr.name + ': ' + real.factoryErr.message : ''))
if (real.factoryErr) {
  console.log('        ' + (real.factoryErr.stack || '').split('\n').slice(0, 4).join('\n        '))
}
ok(!real.factoryErr || real.factoryErr.name !== 'ReferenceError', '[负路径判据] 不得出现 ReferenceError（未定义标识符）')

console.log('== 4. factory 返回值形状 ==')
const ex = real.exports
ok(ex && typeof ex === 'object', 'factory 返回对象')
ok(ex && Array.isArray(ex.inject), 'exports.inject 是数组（cordis 依赖声明）')
ok(ex && typeof ex.apply === 'function', 'exports.apply 是函数（唯一执行器）')
ok(ex && ex.inject && ex.inject.indexOf('slots') >= 0, 'inject 含 slots')

console.log('== 5. [负路径] 同一判据必须能捕到 ReferenceError ==')
const badSrc = 'window.__ModuleLoader__.load({ id: "x", factory: (require) => { var a = 1 + CRLF; return { a: a } } })'
const bad = run(badSrc, 'bad-ref')
// 注意：vm 沙箱内创建的错误与宿主不是同一 realm，`instanceof Error` 会恒为 false ⇒ 用鸭子类型
const isErrLike = (e) => !!e && typeof e === 'object' && typeof e.name === 'string' && typeof e.message === 'string'
ok(isErrLike(bad.factoryErr), '[负路径] 注入未定义标识符 -> factory 确实抛错（判据非恒真）')
ok(bad.factoryErr && bad.factoryErr.name === 'ReferenceError', '[负路径] 抛的正是 ReferenceError：' + (bad.factoryErr && bad.factoryErr.name))

console.log('== 6. [负路径] 语法错误必须编译期就抛 ==')
const syntaxBad = 'window.__ModuleLoader__.load({ id: "x", factory: (require) => { return { ( } } })'
const sb = run(syntaxBad, 'bad-syntax')
ok(!!sb.topErr, '[负路径] 语法错误 -> 顶栏编译期抛错')

console.log('== 7. 同型缺陷扫描：行尾记号不得是未定义标识符 ==')
// 先把字符串/注释剥掉，避免把文案里的 CRLF/PLAN 等词误判为标识符引用。
// 用 charCodeAt 比较换行与反斜杠，避免在本文件里再写反斜杠字面量。
function stripLiterals (src) {
  var out = '', i = 0, n = src.length, NL = 10, BS = 92
  while (i < n) {
    var c = src[i], d = src[i + 1]
    if (c === '/' && d === '/') { while (i < n && src.charCodeAt(i) !== NL) i++; continue }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '\u0027' || c === '\u0022' || c === '`') {
      var q = c; i++
      while (i < n && src[i] !== q) { if (src.charCodeAt(i) === BS) i++; i++ }
      i++; out += ' '; continue
    }
    out += c; i++
  }
  return out
}
const CODE = stripLiterals(SRC)
// 本次事故的缺陷家族：把「行尾记号」当成已定义的常量来拼接。
// 这些名字一旦出现在代码里（非字符串/注释）却没有声明，就是同型缺陷。
var EOL_NAMES = ['CRLF', 'CR', 'LF', 'EOL', 'NL', 'NEWLINE', 'LINE_END', 'EOL_STR']
var hits = []
for (var hi = 0; hi < EOL_NAMES.length; hi++) {
  var nm = EOL_NAMES[hi]
  var used = new RegExp('(^|[^A-Za-z0-9_$])' + nm + '($|[^A-Za-z0-9_$])').test(CODE)
  if (!used) continue
  var declared = new RegExp('(?:var|let|const|function)[ ]+' + nm + '($|[^A-Za-z0-9_$])').test(CODE)
  if (!declared) hits.push(nm)
}
ok(hits.length === 0, '[CRLF 同型] 行尾记号均已定义；未定义的：' + (hits.join(', ') || '无'))
ok(hits.indexOf('CRLF') < 0, '[CRLF 同型] 具体回归：不得再出现未声明的 CRLF 拼接')

console.log('\n[client-loadable] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail ? 1 : 0)
