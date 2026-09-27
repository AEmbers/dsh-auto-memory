/**
 * R8 验收：配置层对外消费 B（区域尺寸 + 外观 token）
 *   依据 28 卷 §3.1（作者操作面 ② 尺寸 / ④ 外观 token）、§3.6 authorSurface.resize/.aesthetics、70 卷 R8。
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
console.log('=== R8 尺寸 + token 消费验收 ===')

const R = runClient(SRC)
ok(!R.topErr, '① 顶栏执行不抛（' + (R.topErr ? R.topErr.message : 'ok') + '）');
ok(!R.factoryErr, '② ★真执行 factory 不抛（' + (R.factoryErr ? R.factoryErr.message : 'ok') + '）');
const api = R.api || {}
const fns = ['_layoutRegionSizePlanPre', '_applyLayoutRegionSizesPre', '_layoutTokenPlanPre', '_applyLayoutTokensPre'];
ok(fns.every((f) => typeof api[f] === 'function'), '③ 四个 R8 出口均为真函数（' + fns.map((f) => f + '=' + typeof api[f]).join(' ') + '）');
ok(typeof api._layoutRegionPlanPre === 'function', '④ R7 出口仍在（不降级）');
if (R.topErr || R.factoryErr) { console.log(''); console.log('[r8] PASS ' + pass + ' / FAIL ' + fail); process.exit(1) }

const sizePlan = api._layoutRegionSizePlanPre, tokPlan = api._layoutTokenPlanPre;

/* --- 正路径 1：默认 ⇒ 两个计划都空（删配置 = 界面回默认） --- */
const dflt = normalizeLayoutConfig(null)
ok(Array.isArray(sizePlan(dflt)) && sizePlan(dflt).length === 0, '⑤ [正] 无配置 ⇒ 尺寸计划为空');
ok(Array.isArray(tokPlan(dflt)) && tokPlan(dflt).length === 0, '⑥ [正] 无配置 ⇒ token 计划为空');

/* --- 正路径 2：只改一个 region 的 w ⇒ 只这一项进计划 --- */
const p1 = sizePlan(normalizeLayoutConfig({ regions: { page: { w: '900px' } } }))
ok(p1.length === 1 && p1[0].name === 'page' && p1[0].sizes.w === '900px', '⑦ [正] 只改 page.w ⇒ 恰 1 项且 w=900px（实测 ' + JSON.stringify(p1) + '）');
const p2 = sizePlan(normalizeLayoutConfig({ regions: { float: { w: '300px', h: '200px', min: '120px' } } }))
ok(p2.length === 1 && Object.keys(p2[0].sizes).length === 3, '⑧ [正] 三元组 w/h/min 全部进计划（实测 ' + JSON.stringify(p2[0].sizes) + '）');

/* --- 正路径 3：token 白名单两前缀都放行 --- */
const t1 = tokPlan(normalizeLayoutConfig({ tokens: { '--dam-accent': '#ff0000' } }))
ok(t1.length === 1 && t1[0].key === '--dam-accent' && t1[0].value === '#ff0000', '⑨ [正] --dam-* token 进计划（实测 ' + JSON.stringify(t1) + '）');
const t2 = tokPlan(normalizeLayoutConfig({ tokens: { '--skin-color-bg': '#101010' } }))
ok(t2.length === 1 && t2[0].key === '--skin-color-bg', '⑩ [正] --skin-* token 同效');
const t3 = tokPlan(normalizeLayoutConfig({ tokens: { '--skin-b': 'x', '--dam-a': 'y' } }))
ok(t3.length === 2 && t3[0].key === '--dam-a' && t3[1].key === '--skin-b', '⑪ [正] 多项按 key 定序（可复算）');

/* --- 负路径 1：非白名单前缀 ⇒ 不进计划 --- */
const t4 = tokPlan(normalizeLayoutConfig({ tokens: { color: 'red', background: 'blue' } }))
ok(t4.length === 0, '⑫ [负] 非白名单前缀（color/background）⇒ 进不了计划（实测 ' + t4.length + ' 项）');
const t5 = tokPlan({ ok: true, config: { tokens: { '--dam-x': 'v', 'color': 'red', '--skin-y': 'w' } } })
ok(t5.length === 2 && t5.every((x) => x.key.indexOf('--dam-') === 0 || x.key.indexOf('--skin-') === 0), '⑬ [负] 混合输入 ⇒ 只放行白名单（实测 ' + JSON.stringify(t5.map((x) => x.key)) + '）');

/* --- 负路径 2：12 种畸形入参 ⇒ 不抛且必返数组 --- */
const junk = [null, undefined, 0, '', 'x', [], { ok: false }, { ok: true }, { ok: true, config: null },
  { ok: true, config: { regions: 'x', tokens: 'y' } }, { ok: true, config: { regions: { page: null }, tokens: { '--dam-a': 1 } } },
  { ok: true, config: { regions: { page: { w: 123 } }, tokens: { '--dam-a': '' } } }]
let threw = null; const sOut = [], tOut = []
for (const j of junk) { try { sOut.push(sizePlan(j)); tOut.push(tokPlan(j)) } catch (e) { threw = e } }
ok(!threw, '⑭ [负] 12 种畸形入参两个 plan 都不抛（' + (threw ? threw.message : 'ok') + '）');
ok(sOut.length === junk.length && sOut.every((x) => Array.isArray(x)) && tOut.every((x) => Array.isArray(x)), '⑮ [负] 畸形入参一律返回数组');
ok(sOut[sOut.length - 1].length === 0, '⑯ [负] w 为数字 123 ⇒ 不进计划（只收字符串）');
ok(tOut[tOut.length - 1].length === 0, '⑰ [负] token 值为空串 ⇒ 不进计划');

/* --- 真调用：region 尺寸写到节点 inline 变量 --- */
const nodePage = mkEl('page'), nodeFloat = mkEl('float');
const R2 = runClient(SRC, { querySelectorAll: (sel) => (String(sel).indexOf('data-dam-region') >= 0 ? [nodePage, nodeFloat] : []) })
ok(!R2.factoryErr && R2.api, '⑱ 第二沙箱真执行 factory 不抛');
const a2 = R2.api || {};
const applied = a2._applyLayoutRegionSizesPre(normalizeLayoutConfig({ regions: { page: { w: '900px', min: '320px' } } }))
ok(applied === 1, '⑲ [正] 真调用 ⇒ 应用 1 个 region（实测 ' + applied + '）');
ok(nodePage.style.getPropertyValue('--dam-region-w') === '900px', '⑳ [正] page 真拿到 --dam-region-w=900px（实测 "' + nodePage.style.getPropertyValue('--dam-region-w') + '"）');
ok(nodePage.style.getPropertyValue('--dam-region-min') === '320px', '㉑ [正] page 真拿到 --dam-region-min=320px');
ok(nodePage.style.getPropertyValue('--dam-region-h') === '', '㉒ [正] 未配置的 h 被写空（不残留）');
ok(nodeFloat.style.getPropertyValue('--dam-region-w') === '', '㉓ [正] 未配置的 float 零改动');

a2._applyLayoutRegionSizesPre(normalizeLayoutConfig(null));
ok(nodePage.style.getPropertyValue('--dam-region-w') === '', '㉔ [正] 恢复默认 ⇒ 变量清空（界面回默认）');

/* --- 真调用：token 写到根元素 --- */
const tokApplied = a2._applyLayoutTokensPre(normalizeLayoutConfig({ tokens: { '--dam-accent': '#ff0000', '--skin-bg': '#101010' } }))
ok(tokApplied === 2, '㉕ [正] 真调用 ⇒ 应用 2 个 token（实测 ' + tokApplied + '）');
ok(R2.rootEl.style.getPropertyValue('--dam-accent') === '#ff0000', '㉖ [正] 根元素真拿到 --dam-accent=#ff0000（实测 "' + R2.rootEl.style.getPropertyValue('--dam-accent') + '"）');
ok(R2.rootEl.style.getPropertyValue('--skin-bg') === '#101010', '㉗ [正] 根元素真拿到 --skin-bg=#101010');

a2._applyLayoutTokensPre(normalizeLayoutConfig({ tokens: { '--dam-accent': '#00ff00' } }));
ok(R2.rootEl.style.getPropertyValue('--dam-accent') === '#00ff00', '㉘ [正] 改值 ⇒ 即时覆盖（新值生效）');
ok(R2.rootEl.style.getPropertyValue('--skin-bg') === '', '㉙ [正] 该项已从配置移除 ⇒ 被清空（撤销语义）');

a2._applyLayoutTokensPre(normalizeLayoutConfig(null));
ok(R2.rootEl.style.getPropertyValue('--dam-accent') === '', '㉚ [正] 恢复默认 ⇒ 全部清空、回零 inline');

/* --- 负路径 3：畸形配置传 apply ⇒ 不抛 + 清脏值 --- */
let apThrew = null;
try { a2._applyLayoutRegionSizesPre({ ok: false }); a2._applyLayoutTokensPre(null); a2._applyLayoutTokensPre(123) } catch (e) { apThrew = e }
ok(!apThrew, '㉛ [负] apply 传畸形配置不抛（' + (apThrew ? apThrew.message : 'ok') + '）');
ok(nodePage.style.getPropertyValue('--dam-region-w') === '' && R2.rootEl.style.getPropertyValue('--dam-accent') === '', '㉜ [负] 畸形配置 ⇒ 变量被清空而非残留脏值');

/* --- 负路径 4：DOM 查询抛 / documentElement 缺失 ⇒ 静默返回 0 --- */
const R3 = runClient(SRC, { querySelectorAll: () => { throw new Error('boom') } })
let dThrew = null, dRet = null;
try { dRet = (R3.api || {})._applyLayoutRegionSizesPre(normalizeLayoutConfig({ regions: { page: { w: '1px' } } })) } catch (e) { dThrew = e }
ok(!dThrew && dRet === 0, '㉝ [负] 查询抛错 ⇒ 尺寸静默返回 0（ret=' + dRet + '）');

/* --- ★守卫反向验证：真删被检定义 ⇒ 必须变红 --- */
const needle = '    function layoutTokenPlanPre(cfg) {'
const hits = SRC.split(needle).length - 1
ok(hits === 1, '㉞ 反向验证前置：被删锚串恰命中 1 次（实测 ' + hits + '）');
const removed = SRC.replace(needle, '    function layoutTokenPlanPre_REMOVED(cfg) {');
const R4 = runClient(removed);
const negGreen = !R4.topErr && !R4.factoryErr && typeof (R4.api || {})._layoutTokenPlanPre === 'function';
ok(!negGreen, '㉟ [负] 真删定义 ⇒ 守卫变红（实测 ' + (R4.factoryErr ? 'factory 抛 ' + R4.factoryErr.message.slice(0, 50) : '出口=' + typeof (R4.api || {})._layoutTokenPlanPre) + '）');

const needle2 = '    function layoutRegionSizePlanPre(cfg) {'
ok(SRC.split(needle2).length - 1 === 1, '㊱ 反向验证前置 2：尺寸锚串恰命中 1 次');
const R5 = runClient(SRC.replace(needle2, '    function layoutRegionSizePlanPre_REMOVED(cfg) {'));
const negGreen2 = !R5.topErr && !R5.factoryErr && typeof (R5.api || {})._layoutRegionSizePlanPre === 'function';
ok(!negGreen2, '㊲ [负] 真删尺寸定义 ⇒ 守卫变红（实测 ' + (R5.factoryErr ? 'factory 抛 ' + R5.factoryErr.message.slice(0, 50) : '出口=' + typeof (R5.api || {})._layoutRegionSizePlanPre) + '）');

console.log('');
console.log('=========================================');
console.log('[r8-config-consume-b] PASS ' + pass + ' / FAIL ' + fail);
console.log('=========================================');
process.exit(fail ? 1 : 0)