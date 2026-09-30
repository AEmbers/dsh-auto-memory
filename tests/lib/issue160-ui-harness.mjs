import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Execute the actual client components and their hooks with controllable IO/time.
// Child components remain elements, just like the existing iter5 smoke harness.
export function clientHarness(root) {
  let rendering, exposed, nextTimer = 0, identity = 'session-a|/ws/a'
  const intervals = new Map(), storage = new Map(), events = new Map(), requests = []
  let accept = true, confirms = 0, get = async () => ({}), post = async () => ({})
  const React = {
    Fragment: 'fragment', createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    cloneElement(node, props) { return { ...node, props: { ...node.props, ...props } } },
    useState(initial) {
      const owner = rendering, i = owner.cursor++
      if (!(i in owner.states)) owner.states[i] = typeof initial === 'function' ? initial() : initial
      return [owner.states[i], value => { if (!owner.mounted) return; owner.states[i] = typeof value === 'function' ? value(owner.states[i]) : value; owner.dirty = true }]
    },
    useRef(value) { const owner = rendering, i = owner.cursor++; return owner.states[i] ||= { current: value } },
    useMemo(fn, deps) { const owner = rendering, i = owner.cursor++, old = owner.states[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) owner.states[i] = { deps, value: fn() }; return owner.states[i].value },
    useEffect(fn, deps) {
      const owner = rendering, i = owner.cursor++, old = owner.effects[i]
      if (!old || !deps || deps.some((v, n) => !Object.is(v, old.deps[n]))) owner.pending.push(() => { old?.cleanup?.(); owner.effects[i] = { deps, cleanup: fn() } })
    },
  }
  React.useReducer = (reducer, initial) => { const pair = React.useState(initial); return [pair[0], action => pair[1](value => reducer(value, action))] }
  React.useLayoutEffect = React.useEffect
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key), get length() { return storage.size } }
  const element = { getAttribute: () => '', setAttribute() {}, style: { setProperty() {} }, classList: { contains: () => false }, querySelector: () => null, closest: () => null, clientWidth: 1100 }
  const document = { documentElement: element, body: element, querySelector: () => null, getElementById: () => null, addEventListener() {}, removeEventListener() {} }
  const window = { localStorage, addEventListener(name, fn) { const set = events.get(name) || new Set(); set.add(fn); events.set(name, set) }, removeEventListener(name, fn) { events.get(name)?.delete(fn) }, confirm() { confirms++; return accept }, __ModuleLoader__: { load(def) { exposed = def.factory(name => { if (name === 'react') return React; throw Error('Module unavailable: ' + name) }) } } }
  const context = vm.createContext({ window, document, localStorage, navigator: { language: 'zh-CN' }, console, URL, URLSearchParams, requestAnimationFrame: fn => fn(), getComputedStyle: () => ({ colorScheme: 'light' }), setTimeout, clearTimeout,
    setInterval(fn) { const id = ++nextTimer; intervals.set(id, fn); return id }, clearInterval(id) { intervals.delete(id) }, fetch: async () => ({ ok: true, json: async () => ({ sources: [], counts: {} }) }) })
  const source = readFileSync(path.join(root, 'lib/client.js'), 'utf8').replace(/\r\n/g, '\n')
  vm.runInContext(source.replace('    return module.exports', `
    exports.issue160 = { RulesEditPanel, StorageTab, Iter5Storage, PySetupWizard, SettingsPage, Iter5Settings, Iter5Page, Iter5Note, Iter5Browse, Iter5Memory, controller, t,
      transport: function (get, post) { apiGet = get; apiPost = post },
      identity: function (get) { iter5Identity = get; currentWs = function () { return get().split('|')[1] }; currentSessionIdClient = function () { return get().split('|')[0] } }
    }; return module.exports`), context)
  const api = exposed.issue160
  api.identity(() => identity)
  api.transport(url => get(url), (url, body) => { requests.push({ url, body: JSON.parse(JSON.stringify(body)) }); return post(url, body) })
  class Runner {
    constructor(component, props = {}) { Object.assign(this, { component, props, states: [], effects: [], pending: [], mounted: true, dirty: true }) }
    render() {
      for (let pass = 0; pass < 20; pass++) {
        this.cursor = 0; this.dirty = false; rendering = this
        this.tree = this.component(this.props); rendering = null
        this.pending.splice(0).forEach(fn => fn())
        if (!this.dirty) return this.tree
      }
      throw Error('Render loop')
    }
    async settle() { for (let i = 0; i < 15; i++) { await Promise.resolve(); if (this.dirty) this.render() } return this.tree }
    unmount() { this.mounted = false; this.effects.forEach(e => e?.cleanup?.()) }
  }
  return { api, requests, events, runner: (component, props) => new Runner(component, props),
    io(g, p) { if (g) get = g; if (p) post = p }, identity(value) { identity = value }, accept(value) { accept = value }, get confirms() { return confirms },
    async tick() { [...intervals.values()].forEach(fn => fn()); for (let i = 0; i < 15; i++) await Promise.resolve() }, get timerCount() { return intervals.size } }
}
export function nodes(tree, predicate, out = []) {
  if (!tree || typeof tree !== 'object') return out
  if (Array.isArray(tree)) tree.forEach(node => nodes(node, predicate, out))
  else { if (predicate(tree)) out.push(tree); nodes(tree.props?.children, predicate, out) }
  return out
}
export const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
export function button(tree, label) {
  const found = nodes(tree, n => n.type === 'button' && n.props.children.flat(Infinity).includes(label))[0]
  if (!found) throw Error('Missing button: ' + label)
  return found
}
