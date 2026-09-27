/**
 * R9 验收：结构层消费 A（slot 层 order + 显隐）
 *   依据 70 卷 R9、authorSurface.reorder/visibility 的 slot 半边、layout-schema 18 slot。
 *
 * CR-10：真执行 factory（照抄 smoke-test-client-loadable 的 require 回调形态）取出口，
 *   真构造 normalize 输出、真调用、断言真实返回值；正负路径齐备 + 守卫反向验证。
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
function mkEl (region) {
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
  if (region) el.__attrs = { 'data-dam-region': region }
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
  const rootEl = { style: mkStyle(), dataset: {}, appendChild: (c) => c };
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
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  return { sandbox, loaded, logs, React, rootEl };
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
console.log('=== R9 结构层 slot 消费验收 ===')

const R = runClient(SRC)
ok(!R.topErr, '① 顶栏执行不抛（' + (R.topErr ? R.topErr.message : 'ok') + '）');
ok(!R.factoryErr, '② ★真执行 factory 不抛（' + (R.factoryErr ? R.factoryErr.message : 'ok') + '）');
const api = R.api || {}
const fns = ['_layoutSlotPlanPre', '_applyLayoutSlotsPre'];
ok(fns.every((f) => typeof api[f] === 'function'), '③ 两个 R9 出口均为真函数（' + fns.map((f) => f + '=' + typeof api[f]).join(' ') + '）');
ok(typeof api._layoutRegionPlanPre === 'function' && typeof api._layoutTokenPlanPre === 'function', '④ R7/R8 出口仍在（不降级）');
if (R.topErr || R.factoryErr) { console.log(''); console.log('[r9] PASS ' + pass + ' / FAIL ' + fail); process.exit(1) }

const slotPlan = api._layoutSlotPlanPre;

/* --- 正路径 1：默认 ⇒ 空计划 --- */
const dflt = normalizeLayoutConfig(null)
ok(Array.isArray(slotPlan(dflt)) && slotPlan(dflt).length === 0, '⑤ [正] 无配置 ⇒ slot 计划为空（默认零视觉变化）');

/* --- 正路径 2：order 单独 / hidden 单独 / 两者 --- */
const p1 = slotPlan(normalizeLayoutConfig({ slots: { head: { order: 5 } } }))
ok(p1.length === 1 && p1[0].name === 'head' && p1[0].order === 5 && p1[0].hidden === false, '⑥ [正] 只改 head.order ⇒ 恰 1 项（实测 ' + JSON.stringify(p1) + '）');
const p2 = slotPlan(normalizeLayoutConfig({ slots: { nav: { hidden: true } } }))
ok(p2.length === 1 && p2[0].name === 'nav' && p2[0].hidden === true && p2[0].order === null, '⑦ [正] 只改 nav.hidden ⇒ 恰 1 项且 order 为 null');
const p3 = slotPlan(normalizeLayoutConfig({ slots: { detail: { order: 9, hidden: true } } }))
ok(p3.length === 1 && p3[0].order === 9 && p3[0].hidden === true, '⑧ [正] order + hidden 同时生效');
const p4 = slotPlan(normalizeLayoutConfig({ slots: { head: { order: 5 }, 'stats-row': { order: 3 } } }))
ok(p4.length === 2 && p4[0].name === 'head' && p4[1].name === 'stats-row', '⑨ [正] 多项按 name 定序（可复算）');

/* --- 正路径 3：hidden[] 便捷写法同效（normalize 层）--- */
const p5 = slotPlan(normalizeLayoutConfig({ hidden: ['badge'] }))
ok(p5.length === 1 && p5[0].name === 'badge' && p5[0].hidden === true, '⑩ [正] hidden:["badge"] 便捷写法 ⇒ 同效（实测 ' + JSON.stringify(p5) + '）');

/* --- 正路径 4：真调用写 DOM --- */
const nHead = mkEl('page'); nHead.__attrs['data-dam-slot'] = 'head';
const nNav = mkEl('page-nav'); nNav.__attrs['data-dam-slot'] = 'nav';
const R2 = runClient(SRC, { querySelectorAll: (sel) => (String(sel).indexOf('data-dam-slot') >= 0 ? [nHead, nNav] : []) })
ok(!R2.factoryErr && R2.api, '⑪ 第二沙箱真执行 factory 不抛');
const a2 = R2.api || {};
const applied = a2._applyLayoutSlotsPre(normalizeLayoutConfig({ slots: { head: { order: 5 } } }));
ok(applied === 1, '⑫ [正] 真调用 ⇒ 应用 1 个 slot（实测 ' + applied + '）');
ok(nHead.style.order === '5', '⑬ [正] head 真拿到 style.order=5（实测 "' + nHead.style.order + '"）');
ok(nNav.style.order === undefined, '⑭ [正] 未配置的 nav 零改动（产品未碰该节点，style.order 仍为 undefined）');

a2._applyLayoutSlotsPre(normalizeLayoutConfig({ slots: { nav: { hidden: true } } }));
ok(nNav.style.display === 'none', '⑮ [正] nav 真拿到 display:none');
ok(nHead.style.order === '', '⑯ [正] 本轮不在计划内且上轮写过 ⇒ 被清空回默认');

a2._applyLayoutSlotsPre(normalizeLayoutConfig(null));
ok(nNav.style.display === '' && nHead.style.order === '', '⑰ [正] 恢复默认 ⇒ 全部清空、回零 inline');

/* --- ★交叉守卫：双锚点节点上 R9 不得覆盖 R7 写的 region 样式 --- */
const nBoth = mkEl('page'); nBoth.__attrs['data-dam-slot'] = 'board';
const R3 = runClient(SRC, { querySelectorAll: (sel) => { const s = String(sel); if (s.indexOf('data-dam-region') >= 0) return [nBoth]; if (s.indexOf('data-dam-slot') >= 0) return [nBoth]; return [] } })
const a3 = R3.api || {};
a3._applyLayoutSlotsPre(normalizeLayoutConfig({ slots: { board: { order: 7 } } }));
ok(nBoth.style.order === '7', '⑱ [交叉] R9 先写 slot.order=7');
a3._applyLayoutRegionSizesPre(normalizeLayoutConfig({ regions: { page: { w: '900px' } } }));
const orderBefore = nBoth.style.order;
a3._applyLayoutSlotsPre(normalizeLayoutConfig({ slots: { board: { hidden: true } } }));
ok(orderBefore === '7' && nBoth.style.display === 'none', '⑲ [交叉] 双锚点节点：R9 后写 hidden 生效');
a3._applyLayoutSlotsPre(normalizeLayoutConfig(null));
ok(nBoth.style.order === '' && nBoth.style.display === '', '⑳ [交叉] R9 撤回自己写的值（清空）');

/* --- ★负路径 1：未配置节点不被越权改动（关键回归）--- */
const nForeign = mkEl('__placeholder__'); nForeign.__attrs['data-dam-slot'] = 'graph';
nForeign.style.display = 'none';   // 模拟 R7 在该节点（双锚点场景）写下的 region hidden
const nForeign2 = mkEl('__placeholder__'); nForeign2.__attrs['data-dam-slot'] = 'chart';
nForeign2.style.order = '99';
const RC1 = runClient(SRC, { querySelectorAll: (sel) => (String(sel).indexOf('data-dam-slot') >= 0 ? [nForeign, nForeign2] : []) });
(RC1.api || {})._applyLayoutSlotsPre(normalizeLayoutConfig({ slots: { head: { order: 1 } } }));
ok(nForeign.style.display === 'none', '㉑ [负] ★未配置且非本层写过的节点：display 不被清空（R7 的 region hidden 不被越权覆盖）');
ok(nForeign2.style.order === '99', '㉒ [负] ★同上：order 也不被越权改动');

/* --- 负路径 2：畸形入参 --- */
const junk = [null, undefined, 0, '', 'x', [], { ok: false }, { ok: true }, { ok: true, config: null },
  { ok: true, config: { slots: 'x' } }, { ok: true, config: { slots: { head: null } } },
  { ok: true, config: { slots: { head: { order: '5' } } } }, { ok: true, config: { slots: { head: { order: NaN } } } },
  { ok: true, config: { slots: { head: { order: Infinity } } } }]
let threw = null; const outs = []
for (const j of junk) { try { outs.push(slotPlan(j)) } catch (e) { threw = e } }
ok(!threw, '㉓ [负] 14 种畸形入参不抛（' + (threw ? threw.message : 'ok') + '）');
ok(outs.length === junk.length && outs.every((x) => Array.isArray(x)), '㉔ [负] 畸形入参一律返回数组');
ok(outs[outs.length - 1].length === 0 && outs[outs.length - 2].length === 0 && outs[outs.length - 3].length === 0,
  '㉕ [负] order 为字符串/NaN/Infinity ⇒ 全不进计划（只收有限数字）');
ok(slotPlan({ ok: true, config: { slots: { __unknown__: { order: 5 } } } }).length === 1, '㉖ [负] 未在 schema 中的 slot 名：plan 层不崩（由 normalize 层负责过滤）');

/* --- 负路径 3：DOM 抛错 / 畸形配置传 apply --- */
const R5 = runClient(SRC, { querySelectorAll: () => { throw new Error('boom') } })
let dThrew = null, dRet = null;
try { dRet = (R5.api || {})._applyLayoutSlotsPre(normalizeLayoutConfig({ slots: { head: { order: 1 } } })) } catch (e) { dThrew = e }
ok(!dThrew && dRet === 0, '㉗ [负] 查询抛错 ⇒ 静默返回 0（ret=' + dRet + '）');
let apThrew = null;
try { a2._applyLayoutSlotsPre(null); a2._applyLayoutSlotsPre({ ok: false }); a2._applyLayoutSlotsPre(42) } catch (e) { apThrew = e }
ok(!apThrew, '㉘ [负] apply 传畸形配置不抛');

/* --- ★守卫反向验证 --- */
const needle = '    function layoutSlotPlanPre(cfg) {'
ok(SRC.split(needle).length - 1 === 1, '㉙ 反向验证前置：slot 计划锚串恰命中 1 次');
const R6 = runClient(SRC.replace(needle, '    function layoutSlotPlanPre_REMOVED(cfg) {'));
const negGreen = !R6.topErr && !R6.factoryErr && typeof (R6.api || {})._layoutSlotPlanPre === 'function';
ok(!negGreen, '㉚ [负] 真删定义 ⇒ 守卫变红（实测 ' + (R6.factoryErr ? 'factory 抛 ' + R6.factoryErr.message.slice(0, 50) : '出口=' + typeof (R6.api || {})._layoutSlotPlanPre) + '）');

const needle2 = '    function applyLayoutSlotsPre(cfg) {'
ok(SRC.split(needle2).length - 1 === 1, '㉛ 反向验证前置 2：apply 锚串恰命中 1 次');
const R7 = runClient(SRC.replace(needle2, '    function applyLayoutSlotsPre_REMOVED(cfg) {'));
const negGreen2 = !R7.topErr && !R7.factoryErr && typeof (R7.api || {})._applyLayoutSlotsPre === 'function';
ok(!negGreen2, '㉜ [负] 真删 apply 定义 ⇒ 守卫变红（实测 ' + (R7.factoryErr ? 'factory 抛 ' + R7.factoryErr.message.slice(0, 50) : '出口=' + typeof (R7.api || {})._applyLayoutSlotsPre) + '）');

console.log('');
console.log('=========================================');
console.log('[r9-structure-consume-a] PASS ' + pass + ' / FAIL ' + fail);
console.log('=========================================');
process.exit(fail ? 1 : 0)