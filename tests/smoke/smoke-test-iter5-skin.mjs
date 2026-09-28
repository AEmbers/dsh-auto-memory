import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const classic = source.replace(/    \/\/ ITER5-GENERATED:BEGIN[\s\S]*?    \/\/ ITER5-GENERATED:END\n/, '')
  .replace("+ DAM_SKIN_V4_CSS + '\\n' + ITER5_CSS + '\\n/* dam-skin:end (v4) */'", "+ DAM_SKIN_V4_CSS + '\\n/* dam-skin:end (v4) */'")
  .replace('h(Iter5Page, { nonce: nonce, onExit:', 'h(DamSkinV4Page, { nonce: nonce, onExit:')
  .replace("try { ensureStyle(); if (damSkinActive() === 'v4') damSkinEnsureCss() } catch", 'try { ensureStyle() } catch')
  .replace('function DialogHost() {\n      var tourDeep = useDeepTheme()\n      var tickPair = useTick()', 'function DialogHost() {\n      var tickPair = useTick()')
  .replace("tourStep === 0 ? h(SkinHero, { slot: 'hero.welcome', deep: tourDeep })", "tourStep === 0 ? h(SkinHero, { slot: 'hero.welcome', deep: useDeepTheme() })")
assert.equal(createHash('sha256').update(classic).digest('hex'), '8fc8150132e09b9bd21763621a177f7d0dea018097ce9b7a747dd67bc84d3070', 'Classic bundle equals upstream after removing three opt-in seams and the documented tour hook fix')
console.log('PASS classic source preserved except documented tour hook fix')

const css = readFileSync(new URL('../../skins/iter5/skin.css', import.meta.url), 'utf8')
for (const line of css.split('\n')) {
  const consumers = line.replace(/--i5-[\w-]+:[^;}]+/g, '')
  assert(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(consumers), 'Colors must use named tokens: ' + line)
}
assert(!source.includes('BData.'), 'No demo data shipped')
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
const localStorage = { getItem: () => null, setItem() {}, removeItem() {}, length: 0 }
const document = { documentElement: { getAttribute: () => '', style: { setProperty() {} }, classList: { contains: () => false } }, querySelector: () => null, getElementById: () => null }
const window = { localStorage, addEventListener() {}, removeEventListener() {}, confirm() { confirmCount++; return accept }, __ModuleLoader__: { load(def) { exposed = def.factory(name => { if (name === 'react') return React; throw Error('Test module unavailable: ' + name) }) } } }
const context = vm.createContext({ window, document, localStorage, console: { log() {}, warn() {}, info() {}, error() {} }, navigator: { language: 'zh-CN' }, URL, URLSearchParams, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, fetch: () => { throw Error('Unexpected raw fetch') } })
vm.runInContext(source.replace('    return module.exports', `    exports._i5test = { Iter5Settings: Iter5Settings, Iter5Tabs: Iter5Tabs, iter5MemoryRows: iter5MemoryRows, iter5MemorySnapshot: iter5MemorySnapshot, iter5LedgerTitle: iter5LedgerTitle, DialogHost: DialogHost, setDialog: function (d) { dialogState = d }, t: t,
      transport: function (get, post) { apiGet = get; apiPost = post } }
    return module.exports`), context, { filename: fileURLToPath(new URL('../../lib/client.js', import.meta.url)) })
const test = exposed._i5test
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
const appearance=nodes(tree,n=>n.type==='section'&&n.props.id==='i5-settings-section-look')[0]
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
assert.equal(cursor,hiddenHooks,'Hidden-to-visible welcome transition must not add hooks')
cursor=0;test.setDialog(null);test.DialogHost()
assert.equal(cursor,hiddenHooks,'Closing the welcome tour must not remove hooks')
console.log('PASS real DialogHost hook count stable when opening and closing welcome tour')
