/**
 * R10 验收：结构层消费 B（block 层）——
 *   ① R10a：lib/layout-config.js 的 blocks 段（--dam-block-style / --dam-block-bg 契约）
 *   ② R10b：10 个 block 节点补 data-dam-kind（使 schema 的 [data-dam-block][data-dam-kind="Z"] 可命中）
 *   ③ R10c：前端 layoutBlockPlanPre / applyLayoutBlocksPre 消费
 *
 * CR-10：真执行 factory（照抄 smoke-test-client-loadable 的 require 回调形态）取出口，
 *   真构造 normalize 输出、真构造 DOM、真调用、断言真实返回值；正负路径齐备 + 守卫反向验证 +
 *   ★跨层守卫反证（block 层不得碰 R7/R8/R9 的属性）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { normalizeLayoutConfig, LAYOUT_BLOCK_KINDS } from '../../lib/layout-config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8')

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok   - ' + m) } else { fail++; console.log('  FAIL - ' + m) } }

/* ---------- 宿主沙箱（与既有加载守卫同构） ---------- */
function mkStyle () {
  const store = {}
  return {
    setProperty: function (k, v) { store[k] = String(v) },
    getPropertyValue: function (k) { return store[k] == null ? '' : store[k] },
    removeProperty: function (k) { delete store[k] },
    get __store () { return store },
  }
}
function mkEl (attrs) {
  const el = {
    style: mkStyle(), dataset: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    appendChild: (c) => c, removeChild: () => {}, setAttribute: () => {}, removeAttribute: () => {},
    getAttribute: function (k) { return (this.__attrs && this.__attrs[k] != null) ? this.__attrs[k] : null },
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    insertBefore: () => {}, contains: () => false, focus: () => {}, blur: () => {},
    firstChild: null, parentNode: null, children: [], textContent: '', innerHTML: '', value: '',
  }
  if (attrs) el.__attrs = Object.assign({}, attrs)
  return el
}
function makeSandbox (opts) {
  const o = opts || {}
  const logs = [], loaded = [], noop = () => {}
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i) => Array.from(store.keys())[i] || null,
    get length () { return store.size },
  }
  const rootEl = { style: mkStyle(), dataset: {}, appendChild: (c) => c }
  const documentStub = {
    head: mkEl(), body: mkEl(), documentElement: rootEl,
    createElement: () => mkEl(), createElementNS: () => mkEl(), createTextNode: () => mkEl(),
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
    document: documentStub, rootEl,
    localStorage: storage, sessionStorage: storage,
    navigator: { userAgent: 'node', language: 'zh' },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    TextEncoder, TextDecoder, URL, URLSearchParams,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  }
  sandbox.globalThis = sandbox; sandbox.self = sandbox
  return { sandbox, loaded, logs, React, rootEl }
}

function runClient (code, opts) {
  const { sandbox, loaded, logs, React, rootEl } = makeSandbox(opts)
  const ctx = vm.createContext(sandbox)
  const out = { api: null, topErr: null, factoryErr: null, logs, rootEl }
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
console.log('=== R10 结构层 block 消费验收 ===')

/* ---- ⓪ R10b：DOM 侧 data-dam-kind 真的存在（选择器可命中）---- */
const kindAttrs = []
{
  const re = /'data-dam-block'\s*:\s*'([A-Za-z0-9_-]+)'/g
  let m
  while ((m = re.exec(SRC)) !== null) kindAttrs.push(m[1])
}
const kindRe = /'data-dam-kind'\s*:\s*'([A-Za-z0-9_-]+)'/g
const kindVals = []
{ let m; while ((m = kindRe.exec(SRC)) !== null) kindVals.push(m[1]) }
ok(kindAttrs.length === 10, '① data-dam-block 恰 10 处（实测 ' + kindAttrs.length + '）')
ok(kindVals.length === 10, '② ★data-dam-kind 恰 10 处（实测 ' + kindVals.length + '，R10b 交付）')
ok(kindVals.slice().sort().join(',') === kindAttrs.slice().sort().join(','),
  '③ ★两个属性的取值集合逐条相同（kind 是 block 的别名，非同值语义）')
ok(LAYOUT_BLOCK_KINDS.every((k) => kindVals.indexOf(k) >= 0), '④ 10 个 kind 与 LAYOUT_BLOCK_KINDS 全覆盖')

/* ---- 真执行 factory（DOM 节点经 opts 注入沙箱，使真实 querySelectorAll 命中）---- */
let NODES = []
const R = runClient(SRC, { querySelectorAll: () => NODES })
ok(!R.topErr, '⑤ 顶栏执行不抛（' + (R.topErr ? R.topErr.message : 'ok') + '）')
ok(!R.factoryErr, '⑥ ★真执行 factory 不抛（' + (R.factoryErr ? R.factoryErr.message : 'ok') + '）')
const api = R.api || {}
const fns = ['_layoutBlockPlanPre', '_applyLayoutBlocksPre']
ok(fns.every((f) => typeof api[f] === 'function'), '⑦ 两个 R10 出口均为真函数（' + fns.map((f) => f + '=' + typeof api[f]).join(' ') + '）')
ok(typeof api._layoutSlotPlanPre === 'function' && typeof api._layoutRegionPlanPre === 'function' && typeof api._layoutTokenPlanPre === 'function',
  '⑧ R7/R8/R9 出口仍在（不降级）')
if (R.topErr || R.factoryErr) { console.log(''); console.log('[r10] PASS ' + pass + ' / FAIL ' + fail); process.exit(1) }

const plan = api._layoutBlockPlanPre
const apply = api._applyLayoutBlocksPre

/* ---- ⑨ 正路径 A：默认配置 ⇒ 空计划（零视觉变化）---- */
const defCfg = normalizeLayoutConfig(null)
ok(plan(defCfg).length === 0, '⑨ 默认配置 ⇒ 空计划（实测 ' + plan(defCfg).length + ' 条）')

/* ---- ⑩ 正路径 B：显式配置 ⇒ 真产行（真调用，断言真实返回值）---- */
const cfgB = normalizeLayoutConfig({ blocks: { list: { style: 'timeline' }, media: { bg: 'url(a.png)' } } })
const planB = plan(cfgB)
ok(cfgB.ok === true, '⑩ 输入 ok=true（warnings=' + cfgB.warnings.length + '）')
ok(planB.length === 2, '⑪ 显式配置 ⇒ 恰 2 条计划（实测 ' + planB.length + '）')
ok(planB[0].kind === 'list' && planB[0].style === 'timeline' && planB[0].bg === '',
  '⑫ list 行：style=timeline / bg 空（' + JSON.stringify(planB[0]) + '）')
ok(planB[1].kind === 'media' && planB[1].bg === 'url(a.png)' && planB[1].style === '',
  '⑬ media 行：bg=url(a.png) / style 空（' + JSON.stringify(planB[1]) + '）')
ok(planB[0].kind < planB[1].kind, '⑭ 计划按 kind 升序（稳定序）')

/* ---- ⑮ 真构造 DOM + 真应用：只写自己两个属性 ---- */
NODES = [
  mkEl({ 'data-dam-block': 'list', 'data-dam-kind': 'list', 'data-dam-slot': 'list' }),
  mkEl({ 'data-dam-block': 'media', 'data-dam-kind': 'media' }),
  mkEl({ 'data-dam-block': 'chart', 'data-dam-kind': 'chart', 'data-dam-region': 'page', 'data-dam-slot': 'chart' }),
]
const nodes = NODES
// 预置 R7/R9 已写下的值（模拟跨层：本层不得改动它们）
nodes[0].style.order = '7'
nodes[0].style.display = 'none'
nodes[2].style.order = '2'
nodes[2].style.setProperty('--dam-region-w', '320px')
const applied = apply(cfgB)
ok(typeof applied === 'number' && applied === 2, '⑮ apply 返回真应用条数 = 2（实测 ' + applied + '）')
ok(nodes[0].style.getPropertyValue('--dam-block-style') === 'timeline',
  '⑯ list 节点真拿到 --dam-block-style=timeline（实测 ' + JSON.stringify(nodes[0].style.getPropertyValue('--dam-block-style')) + '）')
ok(nodes[1].style.getPropertyValue('--dam-block-bg') === 'url(a.png)',
  '⑰ media 节点真拿到 --dam-block-bg=url(a.png)（实测 ' + JSON.stringify(nodes[1].style.getPropertyValue('--dam-block-bg')) + '）')
ok(nodes[2].style.getPropertyValue('--dam-block-style') === '' && nodes[2].style.getPropertyValue('--dam-block-bg') === '',
  '⑱ 未配置的 chart 节点：两个属性均为空（非 undefined/非 none）')

/* ---- ⑲⑳ ★跨层守卫反证：R7/R9 写过的值原封不动 ---- */
ok(nodes[0].style.order === '7' && nodes[0].style.display === 'none',
  '⑲ ★双锚点节点（block+slot）上 R9 写的 order=7 / display=none 未被本层改动（实测 ' + nodes[0].style.order + '/' + nodes[0].style.display + '）')
ok(nodes[2].style.order === '2' && nodes[2].style.getPropertyValue('--dam-region-w') === '320px',
  '⑳ ★三锚点节点（block+region+slot）上 R7/R8 写的 order=2 / --dam-region-w=320px 未被本层改动（实测 ' + nodes[2].style.order + '/' + nodes[2].style.getPropertyValue('--dam-region-w') + '）')

/* ---- ㉑ 幂等：重复 apply 结果一致 ---- */
const before = JSON.stringify(nodes.map((n) => n.style.__store))
apply(cfgB)
const after = JSON.stringify(nodes.map((n) => n.style.__store))
ok(before === after, '㉑ 幂等：第二次 apply 后各节点样式存储逐字节相同')

/* ---- ㉒ 负路径 A：删配置 ⇒ 回默认（已写过的属性被清空）---- */
const appliedDef = apply(defCfg)
ok(appliedDef === 0, '㉒ 默认配置 ⇒ 应用 0 条（实测 ' + appliedDef + '）')
ok(nodes[0].style.getPropertyValue('--dam-block-style') === '' && nodes[1].style.getPropertyValue('--dam-block-bg') === '',
  '㉓ ★删配置 ⇒ 两个属性被清空（回默认，零视觉变化）')
ok(nodes[0].style.order === '7' && nodes[0].style.display === 'none',
  '㉔ ★回默认时仍未触碰 R7/R9 写的 order/display（跨层守卫在反向路径同样成立）')


/* ---- ㉕–㉚ 负路径 B：畸形入参一律不抛、不产行 ---- */
const badInputs = [null, undefined, {}, { ok: false, config: {} }, { ok: true }, { ok: true, config: null },
  { ok: true, config: { blocks: null } }, { ok: true, config: { blocks: 'x' } },
  { ok: true, config: { blocks: { list: null } } }, { ok: true, config: { blocks: { list: 'notObj' } } },
  { ok: true, config: { blocks: { list: {} } } }, { ok: true, config: { blocks: { list: { style: '' } } } },
  { ok: true, config: { blocks: { list: { style: 123 } } } }, { ok: true, config: { blocks: { list: { bg: null } } } }]
let thrown = 0, rows = 0
for (const bad of badInputs) {
  try { rows += plan(bad).length } catch (e) { thrown++ }
}
ok(thrown === 0, '㉕ 14 种畸形入参全部不抛（实测抛出 ' + thrown + ' 次）')
ok(rows === 0, '㉖ 14 种畸形入参一律产 0 行（实测 ' + rows + ' 行）')

/* ---- ㉗ 负路径 C：未知 blockKind 不进计划 ---- */
const cfgX = normalizeLayoutConfig({ blocks: { list: { style: 'timeline' }, __unknown__: { style: 'x' } } })
ok(cfgX.ok === false && cfgX.warnings.length === 1, '㉗ 未知 kind ⇒ ok=false + 恰 1 条告警（实测 ' + cfgX.warnings.length + '）')
ok(plan(cfgX).length === 0, '㉘ ★fail-safe：任一告警（ok=false）⇒ 整批不消费（实测 ' + plan(cfgX).length + ' 行）——与 R7/R8/R9 同款语义')

/* ---- ㉙ 真删除守卫反向验证（真删定义 ⇒ factory 必须报 not defined）---- */
const delPlan = SRC.replace('    function layoutBlockPlanPre(cfg) {', '    function __DELETED__plan(cfg) {')
ok(SRC.split('    function layoutBlockPlanPre(cfg) {').length - 1 === 1, '㉙ 被删锚串在 SRC 中恰命中 1 次（防注释包裹假绿）')
const Rd = runClient(delPlan, { querySelectorAll: () => [] })
const delErr = Rd.factoryErr ? String(Rd.factoryErr.message) : ''
ok(!!Rd.factoryErr && /layoutBlockPlanPre is not defined|not defined/.test(delErr),
  '㉚ ★真删 layoutBlockPlanPre ⇒ factory 报 not defined（实测 ' + JSON.stringify(delErr.slice(0, 60)) + '）')

const delApply = SRC.replace('    function applyLayoutBlocksPre(cfg) {', '    function __DELETED__apply(cfg) {')
ok(SRC.split('    function applyLayoutBlocksPre(cfg) {').length - 1 === 1, '㉛ 第二个被删锚串恰命中 1 次')
const Rd2 = runClient(delApply, { querySelectorAll: () => [] })
ok(!!Rd2.factoryErr && /applyLayoutBlocksPre is not defined|not defined/.test(String(Rd2.factoryErr.message)),
  '㉜ ★真删 applyLayoutBlocksPre ⇒ factory 报 not defined')

console.log('')
console.log('[r10] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)
