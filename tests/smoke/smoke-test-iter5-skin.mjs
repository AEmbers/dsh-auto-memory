import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const BEGIN = '    // ITER5-GENERATED:BEGIN'
const END = '    // ITER5-GENERATED:END'
// ★2026-09-29 断言形态更换（本仓）：原判据是「剥离生成区后整个文件的 sha256 等于某条基线」。
//   它的问题是：**任何**对经典档的正当改动都会让它变红，于是每轮都要重算一次基线 —— 时间花在
//   修断言上而不是修问题上（用户原话）。而它想守的那条红线其实很具体：
//     「皮肤的一切都落在受控生成区内，经典档不被皮肤污染；样式注入是 opt-in 的」。
//   现在直接断言这组**不变量**，既不需要基线，也比摘要更强（摘要只能证明「变了」，不能说明「变坏了」）：
//     ① 生成区存在且非空；② 皮肤标识**一个都不许**出现在生成区之外（先还原接缝再判）；
//     ③ 生成区里必须真有皮肤（否则②会因「根本没有皮肤」而假绿）；
//     ④ 皮肤渲染与样式注入仍受 damSkinActive() 开关约束（经典档零接触）。
assert(source.includes(BEGIN) && source.includes(END), 'generated skin region must be present')
const genStart = source.indexOf(BEGIN)
const genEnd = source.indexOf(END) + END.length
assert(genEnd > genStart, 'generated skin region must be non-empty')

const outside = source.slice(0, genStart) + source.slice(genEnd)
// 先把接缝**还原**再查污染：`Iter5Page` / `ITER5_CSS` 本来就会在这两处接缝行里各出现一次
// （渲染分支与样式注入），那是接口本身，不是泄漏。还原之后仍残留才算泄漏。
// 前三条是生成器**必然**施加的接缝（必须恰命中一次）；后两条（向导 hook）在本仓是**手写已修**，
// 故此处仅在「作者那版写法」存在时才还原 —— 用可选列表表达，避免把「本仓已修好」误判成漂移。
const SEAMS = [
  ["+ DAM_SKIN_V4_CSS + '\\n' + ITER5_CSS + '\\n/* dam-skin:end (v4) */'", "+ DAM_SKIN_V4_CSS + '\\n/* dam-skin:end (v4) */'"],
  ['h(Iter5Page, { nonce: nonce, onExit:', 'h(DamSkinV4Page, { nonce: nonce, onExit:'],
  ["try { ensureStyle(); if (damSkinActive() === 'v4') damSkinEnsureCss() } catch", 'try { ensureStyle() } catch'],
]
let classic = outside
for (const [from] of SEAMS) {
  assert.equal(classic.split(from).length - 1, 1, 'Required skin seam must match exactly once: ' + from.slice(0, 70))
}
for (const [from, to] of SEAMS) classic = classic.replace(from, to)
// 上面三条是生成器**必然**施加的接缝。向导 hook 那条（React #310）在本仓是**手写已修**的形态
// —— 不还原，直接按下一条断言校验「修好后的形状」必须存在，否则经典档的既修缺陷会悄悄回退。
const SKIN_MARKERS = ['Iter5Page', 'Iter5Surface', 'Iter5Home', 'iter5Identity', 'i5-banner-copy', 'i5-page-head', 'data-iter5', 'ITER5_CSS', 'ITER5_PAGES', 'useIter5Theme']
for (const marker of SKIN_MARKERS) {
  assert(!classic.includes(marker), 'Skin identifier leaked outside the generated region: ' + marker)
}
// 生成区内必须真的含皮肤（否则上面那条会因为「根本没有皮肤」而假绿）。
for (const marker of ['Iter5Page', 'ITER5_CSS', 'useIter5Theme', 'i5-page-head']) {
  assert(source.slice(genStart, genEnd).includes(marker), 'generated region is missing skin code: ' + marker)
}
// React #310 红线：向导首屏的 `useDeepTheme()` 必须在**无条件调用区**，不得留在三元分支里。
assert(!classic.includes("? h(SkinHero, { slot: 'hero.welcome', deep: useDeepTheme() })"), 'hook must not be called inside the welcome-tour ternary (#310)')
assert(/function DialogHost\(\) \{[\s\S]{0,900}?\n      var tourDeep = useDeepTheme\(\)\n/.test(classic), 'DialogHost must keep the unconditional tourDeep hook (before any early return)')
assert(classic.includes("? h(SkinHero, { slot: 'hero.welcome', deep: tourDeep })"), 'welcome tour must consume the unconditional tourDeep value')
// ④ 经典档零接触 + 注入 opt-in。
//   注意方向：接缝**还原**后 classic 是「皮肤接入之前」的形态，所以「注入语句存在」这类断言
//   要查 **source**（实时文件），查 classic 会得到相反结论 —— 这一点踩过一次，写清楚。
assert(/function damSkinActive\(\)[\s\S]{0,400}?return ['"]classic['"]/.test(classic), 'classic remains the fail-safe skin when storage is unreadable')
assert(/if \(damSkinActive\(\) === 'v4'\) \{/.test(classic), 'skin render branch stays gated on damSkinActive()')
assert(/if \(damSkinActive\(\) === 'v4'\) damSkinEnsureCss\(\)/.test(source), 'skin stylesheet injection stays gated on damSkinActive() in the live file')
console.log('PASS classic half is skin-free; all seams hit once; skin stays opt-in')

const css = readFileSync(new URL('../../skins/iter5/skin.css', import.meta.url), 'utf8')
for (const line of css.split('\n')) {
  const consumers = line.replace(/--i5-[\w-]+:[^;}]+/g, '')
  assert(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(consumers), 'Colors must use named tokens: ' + line)
}
assert(!source.includes('BData.'), 'No demo data shipped')
const embeddedCss=JSON.parse(source.match(/var ITER5_CSS = (.+)\n/)[1])
const sharedTokens=embeddedCss.match(/\[data-iter5\],\[data-dam-theme\]\{([^}]+)\}/)[1]
assert(sharedTokens.split(';').filter(Boolean).every(declaration=>declaration.startsWith('--')),'Overlay token sharing must not include page flex/height/position styles')
// ── 动效判据（2026-09-29 新增）────────────────────────────────────────────────
// 皮肤原先**一条动效都没有**（卡片入场被 `animation:none` 一并封死）。此处不锁具体数值
// （数值会随设计调整），只锁住那几条「写错就是缺陷」的红线：
// 注意：皮肤里有两个 reduced-motion 块 —— 前一个属于**宿主渲染的覆盖层**（[data-dam-theme]，我们不动它），
// 后一个才是皮肤自己的（[data-iter5]）。判据必须锚到后者。
const reducedAt = embeddedCss.lastIndexOf('@media(prefers-reduced-motion:reduce){')
assert(reducedAt > 0, '皮肤必须有 [data-iter5] 作用域的 reduced-motion 降级块')
const reduced = embeddedCss.slice(reducedAt, reducedAt + 900)
assert(reduced.includes('animation:none!important'), 'reduced-motion 必须去掉位移动画')
assert(!/[^)]\*[^{]*\{[^}]*transition:none!important/.test(reduced), 'reduced-motion 不该用通配选择器把换色过渡一并清零（应减弱而非清零）')
// 入场一律从「有」开始：禁 scale(0)（现实中不会从无到有）。
assert(!/scale\(0\)/.test(embeddedCss), '入场不得从 scale(0) 开始')
// UI 动效不得用 ease-in（起步拖沓，用户最盯的就是起步那一刻）。
assert(!/var\(--i5-dur[^)]*\)\s+ease-in\b/.test(embeddedCss), 'UI 动效不得使用 ease-in')
// 只动 transform / opacity（外加水位环的 stroke-dashoffset）——不得出现 transition: all。
assert(!/transition:\s*all\b/.test(embeddedCss), '禁止 transition: all')
// 动效刻度必须是命名 token，不得散落字面量毫秒（皮肤唯一例外是既有 greet-host 兜底）。
assert(embeddedCss.includes('--i5-ease-out:cubic-bezier(.23,1,.32,1)'), '必须使用强 ease-out 曲线而非内置 ease-out')
assert(/\.i5-ring-progress\{transition:stroke-dashoffset var\(--i5-dur-slow\)/.test(embeddedCss), '水位环过渡必须走刻度 token')
// 按下反馈存在（皮肤此前完全没有 :active 态）。
assert(/\[data-iter5\] button:active:not\(:disabled\)\{transform:scale\(\.97\)/.test(embeddedCss), '按钮必须有按下反馈')
// 换页整块入场存在。
assert(/\[data-iter5\] \.i5-main > :not\(\.i5-page-head\)\{animation:i5-fade-in/.test(embeddedCss), '换页必须有入场过渡')
assert(/\[data-iter5\] \.i5-main > :not\(\.i5-page-head\) > \* > \*\{animation:i5-block-in/.test(embeddedCss), '页面内内容块必须错峰入场（且取到正确的嵌套层）')
// 皮肤自己的卡片不得再被封死动效（原 `animation:none` 写法的回归守卫）。
assert(!/\[data-iter5\] \.i5-card,\[data-iter5\] \.i5-stat\{animation:none/.test(embeddedCss), '皮肤卡片的动效不得被整体封死')
console.log('PASS scoped token colors and no demo data')

// Execute the shipped factory with a small hook harness. No network, real memory,
// browser globals, or production exports are modified by this test.
let states = [], effects = [], cursor = 0, exposed, accept = true, confirmCount = 0
let requests = [], failSave = false
let config = { semanticEngineMode: 'auto', associativeMemoryEnabled: true, memoryAnchorEnabled: false, jsDecideCooldownRounds: 1, injectEnabled: true, locale: 'zh', externalSources: {} }
const React = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
  cloneElement: (node, props) => ({ ...node, props: { ...node.props, ...props } }),
  useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
  useRef(initial) { const [ref] = React.useState(() => ({ current: initial })); return ref },
  useReducer(fn, initial) { const [state, set] = React.useState(initial); return [state, action => set(old => fn(old, action))] },
  useEffect(fn, deps) { const i = cursor++; const old = states[i]; if (!old || deps.some((d, n) => !Object.is(d, old[n]))) { states[i] = deps; effects.push(fn) } },
}
// ★2026-09-29：原先 setItem 是空实现 ⇒ 皮肤主题档位的「写入—读回」永远测不出来（假绿）。
//   改成最小可用的真存储语义：即使不做真持久化，也必须让 get/set/remove 自洽。
const localStorage = (() => {
  const mem = new Map()
  return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)) }, removeItem: (k) => { mem.delete(k) }, get length() { return mem.size } }
})()
const document = { documentElement: { getAttribute: () => '', style: { setProperty() {} }, classList: { contains: () => false } }, querySelector: () => null, getElementById: () => null }
const window = { localStorage, addEventListener() {}, removeEventListener() {}, confirm() { confirmCount++; return accept }, __ModuleLoader__: { load(def) { exposed = def.factory(name => { if (name === 'react') return React; throw Error('Test module unavailable: ' + name) }) } } }
const context = vm.createContext({ window, document, localStorage, console: { log() {}, warn() {}, info() {}, error() {} }, navigator: { language: 'zh-CN' }, URL, URLSearchParams, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, fetch: () => { throw Error('Unexpected raw fetch') } })
vm.runInContext(source.replace('    return module.exports', `    exports._i5test = { useIter5Data: useIter5Data, Iter5Home: Iter5Home, Iter5Settings: Iter5Settings, Iter5Tabs: Iter5Tabs, iter5MemoryRows: iter5MemoryRows, iter5MemorySnapshot: iter5MemorySnapshot, iter5LedgerTitle: iter5LedgerTitle, DialogHost: DialogHost, setDialog: function (d) { dialogState = d }, t: t,
      iter5ThemeGet: iter5ThemeGet, iter5ThemeSet: iter5ThemeSet, iter5ThemeCycle: iter5ThemeCycle, useIter5Theme: useIter5Theme, Iter5Page: Iter5Page,
      transport: function (get, post) { apiGet = get; apiPost = post }, identity: function (value) { iter5Identity = function () { return value } } }
    return module.exports`), context, { filename: fileURLToPath(new URL('../../lib/client.js', import.meta.url)) })
const test = exposed._i5test
// Execute the host theme reader against both current DSH and older host markers.
const themeReader = vm.runInContext('(' + source.slice(source.indexOf('    function readHostDeep()'), source.indexOf('    function useDeepTheme()')) + ')', context)
assert.equal(themeReader(), false)
document.body = { hasAttribute: name => name === 'data-ds-dark-theme' }
assert.equal(themeReader(), true, 'Current host body theme marker is recognized')
document.body = { hasAttribute: () => false }
document.documentElement.style.colorScheme = 'dark'
assert.equal(themeReader(), true, 'Current host color-scheme is recognized')
document.documentElement.style.colorScheme = 'light'
assert.equal(themeReader(), false, 'Switching back to light clears dark theme')
// 皮肤侧三态：档位本身 + 「覆盖宿主」语义（这是用户报障「切了不跟系统 / 看不到档位」的正面判据）。
// 断言的是纯函数与一个真 hook 调用，不读私有实现细节。
assert.equal(test.iter5ThemeGet(), 'auto', '默认档位必须是跟随系统（auto）')
assert.equal(test.iter5ThemeCycle('auto'), 'light')
assert.equal(test.iter5ThemeCycle('light'), 'dark')
assert.equal(test.iter5ThemeCycle('dark'), 'auto', '循环必须闭合回跟随系统')
assert.equal(test.iter5ThemeSet('dark'), undefined)
assert.equal(test.iter5ThemeGet(), 'dark', '显式档位要能读回')
test.iter5ThemeSet('auto')
states = []; effects = []; cursor = 0
document.body = { hasAttribute: () => false }
assert.equal(test.useIter5Theme()[1], false, 'auto 档必须跟随宿主（宿主亮 ⇒ 亮）')
test.iter5ThemeSet('dark')
states = []; effects = []; cursor = 0
assert.equal(test.useIter5Theme()[1], true, 'dark 档必须覆盖宿主亮色')
test.iter5ThemeSet('light')
document.body = { hasAttribute: name => name === 'data-ds-dark-theme' }
states = []; effects = []; cursor = 0
assert.equal(test.useIter5Theme()[1], false, 'light 档必须覆盖宿主暗色')

// 工作台顶部必须真的渲染出主题按钮，且档位写在 data-i5-theme 上（用户「看不到档位」的正面判据）。
states = []; effects = []; cursor = 0
test.iter5ThemeSet('dark')
const pageTree = test.Iter5Page({ nonce: 0, onExit() {} })
const themeBtn = nodes(pageTree, (n) => n.props && n.props['data-i5-theme'] !== undefined)[0]
assert(themeBtn, '工作台顶部必须渲染主题切换按钮')
assert.equal(themeBtn.props['data-i5-theme'], 'dark', 'data-i5-theme 必须反映当前档位')
const workbenchRoot = nodes(pageTree, (n) => n.props && n.props['data-iter5'] === '' && n.props['data-deep'] !== undefined)[0]
assert(workbenchRoot, '工作台根节点必须带 data-deep')
assert.equal(workbenchRoot.props['data-deep'], 'true', 'dark 档必须把 data-deep 置 true（配色开关）')
test.iter5ThemeSet('auto')
states = []; effects = []; cursor = 0
test.iter5ThemeSet('auto')
document.body = { hasAttribute: () => false }
// 上面真调过 useIter5Theme()（占用了钩子槽位）⇒ 必须清干净再交给下面的组件渲染，
// 否则 states[0] 会残留档位字符串，被下游组件的第一个 useState 误读成自身初值。
states = []; effects = []; cursor = 0
assert(!embeddedCss.includes('body:has([data-iter5])'), 'Independent roots never depend on a workbench being mounted')
assert(!embeddedCss.includes('html:has(#dam-skin-v4-style)'), 'Shared overlays do not depend on opt-in stylesheet lifetime')
// ★2026-09-29 真因守卫：宿主的 ThemePresenter 只往三处写主题（html.style.colorScheme、
//   html[data-ds-theme-source]、body[data-ds-dark-theme]）。旧 observer 只盯 html 的
//   class/data-theme/data-dsh-theme ⇒ 宿主一条都不写 ⇒ **永不触发**，主题在挂载时冻结。
//   这里直接断言「观察集合覆盖宿主三种写入」，防止将来有人把 filter 改窄又不自知。
const watched = new Set()
const beforeObserve = context.__observed
vm.runInContext(source.slice(source.indexOf('    var deepSubs = new Set()'), source.indexOf('    /** 背景层')) + '\ndeepWatch()', vm.createContext({
  Set, console, document,
  window: {},
  readHostDeep: () => false,
  MutationObserver: function () { this.observe = (node, opts) => { for (const a of (opts && opts.attributeFilter) || []) watched.add(a) } },
}))
for (const attr of ['style', 'data-ds-theme-source', 'data-ds-dark-theme']) {
  assert(watched.has(attr), 'Host theme write must be observed, else theme changes are invisible: ' + attr)
}
void beforeObserve
console.log('PASS actual host theme markers and standalone entry styles')
test.transport(async url => {
  if (url.includes('/config')) return { config: { ...config } }
  if (url.includes('/semantic-status')) return { loaded: true, ready: false, resolvedTier: 'c1', download: { phase: 'idle' } }
  if (url.includes('/update-check')) return { current: '3.2.1' }
  return {}
}, async (url, patch) => {
  requests.push({ url, patch: JSON.parse(JSON.stringify(patch)) })
  if (failSave) throw Error('injected save failure')
  config = { ...config, ...patch }
  return { config: { ...config } }
})
function render() { cursor = 0; const tree = test.Iter5Settings(); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree }
async function settle() { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); return render() }
function nodes(tree, predicate, out = []) { if (!tree || typeof tree !== 'object') return out; if (Array.isArray(tree)) tree.forEach(x => nodes(x, predicate, out)); else { if (predicate(tree)) out.push(tree); nodes(tree.props?.children, predicate, out) } return out }
function field(tree, key) { const label = test.t(key); const found = nodes(tree, n => n.props?.['aria-label'] === label && n.type === 'input'); assert(found.length, 'Input exists: ' + label); return found[0] }
function button(tree, label) { const found = nodes(tree, n => n.type === 'button' && n.props.children.flat(Infinity).includes(label)); assert(found.length, 'Button exists: ' + label); return found[0] }
render(); let tree = await settle()
assert.equal(field(tree, 'fNoteCap').props.value, 24000)
assert.equal(field(tree, 'fUserCap').props.value, 24000)
console.log('PASS generated settings preserve both upstream capacity defaults')
const appearance=nodes(tree,n=>n.type==='section'&&n.props.id&&n.props.id.endsWith('-section-look'))[0]
assert(button(appearance,test.t('tourReplay')),'Manual welcome entry stays in appearance group')
console.log('PASS welcome replay is reachable under appearance settings')
field(tree, 'fJsCooldown').props.onChange({ target: { value: '7' } })
tree = render()
assert.equal(tree.props['data-i5-dirty'], 'true')
const radio = nodes(tree, n => n.type === 'input' && n.props.type === 'radio' && n.props.value === 'lexical')[0]
radio.props.onChange({ target: { value: 'lexical' } }); tree = await settle()
assert.deepEqual(requests.at(-1).patch, { semanticEngineMode: 'lexical' })
assert.equal(field(tree, 'fJsCooldown').props.value, 7, 'Immediate engine change retains other drafts')
config.injectEnabled = false // Simulate another surface updating an unrelated key.
button(tree, '保存更改').props.onClick(); tree = await settle()
assert.deepEqual(requests.at(-1).patch, { jsDecideCooldownRounds: 7 })
assert.equal(config.injectEnabled, false, 'Unrelated concurrent changes survive save')
assert.equal(tree.props['data-i5-dirty'], 'false')
console.log('PASS immediate engine, draft retention, patch-only save, concurrent unrelated config')

field(tree, 'fJsCooldown').props.onChange({ target: { value: '9' } }); tree = render()
failSave = true
button(tree, '保存更改').props.onClick(); tree = await settle()
assert.equal(tree.props['data-i5-dirty'], 'true')
assert.equal(field(tree, 'fJsCooldown').props.value, 9)
assert(nodes(tree, n => n.props?.['data-dam-error'] === '').some(n => n.props.children.includes('injected save failure')))
button(tree, '取消修改').props.onClick(); tree = render()
assert.equal(field(tree, 'fJsCooldown').props.value, 7)
assert.equal(tree.props['data-i5-dirty'], 'false')
console.log('PASS failed save preserves draft and exposes error; cancel restores last saved config')

// Host-driven unmount must not erase pending edits. Recovery remains in memory,
// not localStorage, and must not write a stale patch without explicit save.
field(tree, 'fJsCooldown').props.onChange({ target: { value: '11' } }); tree = render()
const postsBeforeRemount = requests.length
states = []; effects = []; cursor = 0
tree = render(); tree = await settle()
assert.equal(field(tree, 'fJsCooldown').props.value, 11)
assert.equal(tree.props['data-i5-dirty'], 'true')
assert.equal(requests.length, postsBeforeRemount, 'Recovery cannot auto-save')
button(tree, '取消修改').props.onClick(); tree = render()
states = []; effects = []; cursor = 0
tree = render(); tree = await settle()
assert.equal(field(tree, 'fJsCooldown').props.value, 7)
assert.equal(tree.props['data-i5-dirty'], 'false', 'Discard removes recovery draft')
console.log('PASS host remount restores unsaved edits without browser persistence or automatic writes')

accept = false
field(tree, 'fAssocEngine').props.onChange({ target: { checked: false } }); tree = render()
assert.equal(field(tree, 'fAssocEngine').props.checked, true)
accept = true
field(tree, 'fAssocEngine').props.onChange({ target: { checked: false } }); tree = render()
assert.equal(field(tree, 'fAssocEngine').props.checked, false)
assert.equal(confirmCount, 2)
assert.equal(config.associativeMemoryEnabled, true, 'Confirmation creates a draft; saving performs the write')
console.log('PASS engine-disable confirmation and cancellation')

const built = test.iter5MemoryRows({ userSize: 10, logs: [{ name: '2026-09-28.md', date: '2026-09-28', size: 20 }], reflections: [] }, { userFile: 'fixture/MEMORY.md' })
assert.equal(built.length, 2)
assert.equal(built[0].scope, 'user')
assert.equal(built[1].path, '2026-09-28.md')
console.log('PASS memory-file rows preserve source scope and file route paths')
const boundRows=test.iter5MemoryRows({projectDir:'C:/isolated/project-a',logs:[{name:'2026-09-28.md',date:'2026-09-28',size:20}],reflections:[]},{})
assert.equal(boundRows[0].path,'C:/isolated/project-a/2026-09-28.md','File reads bind to the returned absolute project root')
assert.equal(test.iter5LedgerTitle('handoff-20260928-090000.md'),'2026-09-28 09:00')
let reads=[]
test.transport(async url=>{reads.push(url);return url.endsWith('/state')?{notesPath:'C:/isolated/project-a/MEMORY.md'}:{projectDir:'C:/isolated/project-b',logs:[],reflections:[]}},async()=>{})
await assert.rejects(test.iter5MemorySnapshot(),/工作区数据正在切换/)
assert(reads[0].endsWith('/state')&&reads[1].endsWith('/list'),'State is read before workspace-global list')
console.log('PASS handoff naming and cross-workspace read mismatch rejection')
states=[];effects=[];cursor=0
window['dsh-auto-memory.wizStatus']={loaded:true,ready:false,download:{phase:'idle'}}
test.setDialog(null);test.DialogHost();const hiddenHooks=cursor
cursor=0;test.setDialog({kind:'welcomeTour',manual:true});const tour=test.DialogHost()
assert(tour,'Welcome tour renders')
const welcomeToggles=window['dsh-auto-memory.TOUR_STEPS'].flatMap(step=>step.toggles||[])
assert(welcomeToggles.some(t=>t.key==='workbenchEnabled'))
assert(!welcomeToggles.some(t=>t.key==='workbenchRoot'),'Directory setting cannot be written as a boolean')
assert.equal(cursor,hiddenHooks,'Hidden-to-visible welcome transition must not add hooks')
cursor=0;test.setDialog(null);test.DialogHost()
assert.equal(cursor,hiddenHooks,'Closing the welcome tour must not remove hooks')
console.log('PASS real DialogHost hook count stable when opening and closing welcome tour')

states=[];effects=[];cursor=0
const firstLoad=()=>Promise.resolve({content:'File A'})
test.useIter5Data(firstLoad,['a'])
effects.splice(0).forEach(fn=>fn())
await new Promise(resolve=>setTimeout(resolve,0))
cursor=0
assert.equal(test.useIter5Data(firstLoad,['a']).data.content,'File A')
cursor=0
const switched=test.useIter5Data(()=>Promise.resolve({content:'File B'}),['b'])
assert.equal(switched.data,null,'Changing a file masks the previous result before effects run')
assert.equal(switched.loading,true)
effects.splice(0).forEach(fn=>fn())
await new Promise(resolve=>setTimeout(resolve,0))
cursor=0
assert.equal(test.useIter5Data(()=>Promise.resolve(null),['b']).data.content,'File B')
console.log('PASS file transitions cannot display stale content under a new title')

states=[];effects=[];cursor=0
const home=test.Iter5Home({nonce:0,onNav(){}})
assert.equal(nodes(home,n=>n.props?.className==='i5-daily-card').length,1,'Home retains its real calendar section')
assert.equal(nodes(home,n=>n.props?.className==='i5-activity').length,1,'Home retains recent records')
console.log('PASS refined home retains recent records and calendar entry points')

states=[];effects=[];cursor=0
test.identity('session-a|workspace-a')
let resolveOld
test.useIter5Data(()=>new Promise(resolve=>{resolveOld=resolve}),[])
effects.splice(0).forEach(fn=>fn())
await Promise.resolve()
test.identity('session-b|workspace-b');cursor=0
assert.equal(test.useIter5Data(()=>Promise.resolve('workspace-b'),[]).data,null)
effects.splice(0).forEach(fn=>fn())
await new Promise(resolve=>setTimeout(resolve,0))
resolveOld('workspace-a');await new Promise(resolve=>setTimeout(resolve,0));cursor=0
assert.equal(test.useIter5Data(()=>Promise.resolve(null),[]).data,'workspace-b','Late prior-workspace data must not replace the active scope')
console.log('PASS late results cannot cross session/workspace identity')

// Git may check out skin sources as CRLF on Windows and LF on Linux.
// Both must produce the same normalized bundle without doubled CR bytes.
const fixture=mkdtempSync(path.join(tmpdir(),'iter5-generator-'))
try {
  for(const dir of ['lib','tools','skins/iter5'])mkdirSync(path.join(fixture,dir),{recursive:true})
  writeFileSync(path.join(fixture,'tools/build-iter5-skin.mjs'),readFileSync(new URL('../../tools/build-iter5-skin.mjs',import.meta.url)))
  for(const newline of ['\n','\r\n']) {
    for(const name of ['ui.js','views.js','surfaces.js','skin.css']) {
      const text=readFileSync(new URL('../../skins/iter5/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n')
      writeFileSync(path.join(fixture,'skins/iter5',name),text.replace(/\n/g,newline))
    }
    writeFileSync(path.join(fixture,'lib/client.js'),source.replace(/\n/g,newline))
    execFileSync(process.execPath,[path.join(fixture,'tools/build-iter5-skin.mjs')])
    execFileSync(process.execPath,[path.join(fixture,'tools/build-iter5-skin.mjs'),'--check'])
    const generated=readFileSync(path.join(fixture,'lib/client.js'),'utf8')
    assert(!generated.includes('\r\r'),'No doubled carriage returns')
    assert.equal(generated.replace(/\r\n/g,'\n'),source,'Line ending conversion does not alter bundle content')
  }
} finally {
  assert(path.dirname(fixture)===path.resolve(tmpdir())&&path.basename(fixture).startsWith('iter5-generator-'))
  rmSync(fixture,{recursive:true,force:true})
}
console.log('PASS generator is idempotent with LF and CRLF checkouts')
