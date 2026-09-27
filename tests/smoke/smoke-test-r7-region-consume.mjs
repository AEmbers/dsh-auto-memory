/**
 * R7 验收：配置层对外消费 A（region order + hidden）
 *   依据 56 卷 §二/§三、62 卷 §二、68 卷 §八、70 卷 R7。
 *
 * CR-10：本套件**真执行 factory**（含 require 回调，照抄 smoke-test-client-loadable 的权威写法）
 *   取出 _layoutRegionPlanPre / _applyLayoutRegionsPre，真构造 normalize 输出、真调用、断言真实返回值。
 *   每条判据均配负路径。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { normalizeLayoutConfig } from '../../lib/layout-config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8')

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m) } }

/* ---------- 宿主沙箱（与既有加载守卫同构，含 React 桩与 require 回调） ---------- */
function mkEl () {
  const el = {
    style: {}, dataset: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    appendChild: (c) => c, removeChild: () => {}, setAttribute: () => {}, removeAttribute: () => {},
    getAttribute: function (k) { return (this.__attrs && this.__attrs[k] != null) ? this.__attrs[k] : null },
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    insertBefore: () => {}, contains: () => false, focus: () => {}, blur: () => {},
    firstChild: null, parentNode: null, children: [], textContent: '', innerHTML: '', value: '',
  }
  return el
}

function makeSandbox (opts) {
  const o = opts || {}
  const logs = []
  const loaded = []
  const noop = () => {}
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
    getElementById: () => null, querySelector: () => null,
    querySelectorAll: o.querySelectorAll || (() => []),
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
      addEventListener: noop, removeEventListener: noop,
      setTimeout, clearTimeout, setInterval, clearInterval,
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

/** 真执行 factory：照抄 smoke-test-client-loadable 的 require 回调形态 */
function runClient (code, opts) {
  const { sandbox, loaded, logs, React } = makeSandbox(opts)
  const ctx = vm.createContext(sandbox)
  const out = { api: null, topErr: null, factoryErr: null, logs }
  try { new vm.Script(code, { filename: 'client.js' }).runInContext(ctx, { timeout: 20000 }) }
  catch (e) { out.topErr = e; return out }
  const entry = loaded[loaded.length - 1]
  if (!entry || typeof entry.factory !== 'function') { out.topErr = new Error('未取得 factory'); return out }
  try {
    out.api = entry.factory((name) => {
      if (name === 'react') return React
      if (name === 'react-dom') return { createPortal: (n) => n }
      return {}
    })
  } catch (e) { out.factoryErr = e }
  return out
}

/* ================= 判据 ================= */
console.log('=== R7 region 消费验收 ===')

const R = runClient(SRC)
ok(!R.topErr, '① 顶栏执行不抛（' + (R.topErr ? R.topErr.message : 'ok') + '）');
ok(!R.factoryErr, '② ★真执行 factory 不抛（' + (R.factoryErr ? R.factoryErr.message : 'ok') + '）');
const api = R.api || {}
ok(typeof api._layoutRegionPlanPre === 'function', '③ 出口 _layoutRegionPlanPre 是真函数（实测 ' + typeof api._layoutRegionPlanPre + '）');
ok(typeof api._applyLayoutRegionsPre === 'function', '④ 出口 _applyLayoutRegionsPre 是真函数（实测 ' + typeof api._applyLayoutRegionsPre + '）');
if (R.topErr || R.factoryErr) { console.log(''); console.log('[r7] PASS ' + pass + ' / FAIL ' + fail); process.exit(1) }

const planOf = api._layoutRegionPlanPre

/* --- 正路径 1：删掉配置文件 ⇒ 与默认完全一致（空计划） --- */
const p0 = planOf(normalizeLayoutConfig(null))
ok(Array.isArray(p0) && p0.length === 0, '⑤ [正] 无配置 ⇒ plan 为空（实测 ' + JSON.stringify(p0) + '）');

/* --- 正路径 2：只改一个 region 的 order ⇒ 只有这一项进计划 --- */
const p1 = planOf(normalizeLayoutConfig({ regions: { page: { order: 3 } } }))
ok(p1.length === 1 && p1[0].name === 'page' && p1[0].order === 3 && p1[0].hidden === false,
  '⑥ [正] 只改 page.order ⇒ plan 恰 1 项且 order=3（实测 ' + JSON.stringify(p1) + '）');

/* --- 正路径 3：hidden 两种写法都生效 --- */
const p2 = planOf(normalizeLayoutConfig({ hidden: ['float'] }))
ok(p2.length === 1 && p2[0].name === 'float' && p2[0].hidden === true, '⑦ [正] hidden:[float] ⇒ float.hidden=true');
const p2b = planOf(normalizeLayoutConfig({ regions: { float: { hidden: true } } }))
ok(p2b.length === 1 && p2b[0].name === 'float' && p2b[0].hidden === true, '⑧ [正] regions.float.hidden=true 同效');

/* --- 正路径 4：多项 + 定序可复算 --- */
const p3 = planOf(normalizeLayoutConfig({ regions: { settings: { order: 5 }, dialog: { order: 1 }, page: { hidden: true } } }))
ok(p3.length === 3 && p3.map((x) => x.name).join(',') === 'dialog,page,settings', '⑨ [正] 3 项 ⇒ 按 name 定序（实测 ' + p3.map((x) => x.name).join(',') + '）');
const p3b = planOf(normalizeLayoutConfig({ regions: { page: { hidden: true }, dialog: { order: 1 }, settings: { order: 5 } } }))
ok(JSON.stringify(p3) === JSON.stringify(p3b), '⑩ [正] 键序不同、语义同 ⇒ 输出逐字节一致（可复算）');

/* --- 负路径 1：未知 region 名 ⇒ 不崩、不进计划 --- */
const unk = normalizeLayoutConfig({ regions: { 'no-such-region': { order: 9 } } })
const p4 = planOf(unk)
ok(p4.length === 0 && unk.warnings.length >= 1, '⑪ [负] 未知 region ⇒ plan 空且留告警（warnings=' + unk.warnings.length + '）');

/* --- 负路径 2：12 种畸形入参 ⇒ 不抛且必返数组 --- */
const junk = [null, undefined, 0, '', 'x', [], { ok: false }, { ok: true }, { ok: true, config: null },
  { ok: true, config: { regions: 'x' } }, { ok: true, config: { regions: { page: null } } },
  { ok: true, config: { regions: { page: { order: 'abc' } } } }]
let threw = null; const outs = []
for (const j of junk) { try { outs.push(planOf(j)) } catch (e) { threw = e } }
ok(!threw, '⑫ [负] 12 种畸形入参全部不抛（' + (threw ? threw.message : 'ok') + '）');
ok(outs.length === junk.length && outs.every((x) => Array.isArray(x)), '⑬ [负] 畸形入参一律返回数组');
ok(outs[outs.length - 1].length === 0, '⑭ [负] order 为非法字符串 ⇒ 不进计划（不产生 NaN 式样式）');

/* --- DOM 应用：真调用 + 真断言节点样式 --- */
const nodePage = mkEl(); nodePage.__attrs = { 'data-dam-region': 'page' }
const nodeFloat = mkEl(); nodeFloat.__attrs = { 'data-dam-region': 'float' }
const nodeNav = mkEl(); nodeNav.__attrs = { 'data-dam-region': 'page-nav' }
const R2 = runClient(SRC, { querySelectorAll: (sel) => (String(sel).indexOf('data-dam-region') >= 0 ? [nodePage, nodeFloat, nodeNav] : []) })
ok(!R2.factoryErr && R2.api, '⑮ 第二沙箱真执行 factory 不抛（DOM 查询已接）');
const api2 = R2.api || {}
const applied = api2._applyLayoutRegionsPre(normalizeLayoutConfig({ regions: { page: { order: 3, hidden: true } } }))
ok(applied === 1, '⑯ [正] 真调用 apply ⇒ 应用 1 个节点（实测 ' + applied + '）');
ok(nodePage.style.order === '3', '⑰ [正] page 真拿到 style.order="3"（实测 "' + nodePage.style.order + '"）');
ok(nodePage.style.display === 'none', '⑱ [正] page.hidden=true ⇒ display="none"（实测 "' + nodePage.style.display + '"）');
ok(nodeFloat.style.order === '' && nodeFloat.style.display === '', '⑲ [正] 未配置的 float 零改动');
ok(nodeNav.style.order === '' && nodeNav.style.display === '', '⑳ [正] 未配置的 page-nav 零改动');

const applied2 = api2._applyLayoutRegionsPre(normalizeLayoutConfig({ regions: { page: { order: 3, hidden: true } } }))
ok(applied2 === 1 && nodePage.style.order === '3', '㉑ [正] 重复应用幂等（第二次仍 applied=1）');
api2._applyLayoutRegionsPre(normalizeLayoutConfig(null))
ok(nodePage.style.order === '' && nodePage.style.display === '' && nodeFloat.style.display === '', '㉒ [正] 恢复默认 ⇒ 已写样式清空、回到零 inline');

/* --- 负路径 3：畸形配置传给 apply ⇒ 不崩 + 清脏值 --- */
let apThrew = null
try { api2._applyLayoutRegionsPre({ ok: false }); api2._applyLayoutRegionsPre(null); api2._applyLayoutRegionsPre(123) } catch (e) { apThrew = e }
ok(!apThrew, '㉓ [负] apply 传 3 种畸形配置不抛（' + (apThrew ? apThrew.message : 'ok') + '）');
ok(nodePage.style.order === '' && nodePage.style.display === '', '㉔ [负] 畸形配置 ⇒ 样式被清空而非残留脏值');

/* --- 负路径 4：querySelectorAll 抛错 ⇒ 静默返回 0 --- */
const R3 = runClient(SRC, { querySelectorAll: () => { throw new Error('boom') } })
let domThrew = null, domRet = null
try { domRet = (R3.api || {})._applyLayoutRegionsPre(normalizeLayoutConfig({ regions: { page: { order: 1 } } })) } catch (e) { domThrew = e }
ok(!domThrew && domRet === 0, '㉕ [负] 查询抛错 ⇒ 静默返回 0，绝不让面板崩（ret=' + domRet + '）');

/* --- ★守卫反向验证：真删被检定义 ⇒ 必须变红 --- */
const needle = '    function layoutRegionPlanPre(cfg) {'
const hits = SRC.split(needle).length - 1
ok(hits === 1, '㉖ 反向验证前置：被删锚串恰命中 1 次（实测 ' + hits + '）');
const removed = SRC.replace(needle, '    function layoutRegionPlanPre_REMOVED(cfg) {');
const R4 = runClient(removed)
const negGreen = !R4.topErr && !R4.factoryErr && typeof (R4.api || {})._layoutRegionPlanPre === 'function'
ok(!negGreen, '㉗ [负] 真删定义 ⇒ 守卫变红（实测 ' + (R4.factoryErr ? 'factory 抛 ' + R4.factoryErr.message.slice(0, 50) : '出口=' + typeof (R4.api || {})._layoutRegionPlanPre) + '）');

console.log('');
console.log('=========================================');
console.log('[r7-region-consume] PASS ' + pass + ' / FAIL ' + fail);
console.log('=========================================');
process.exit(fail ? 1 : 0)