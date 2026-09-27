import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// ★2026-09-28 多语言化：源码内联文案已改为 L(甲, 乙)。抽段进 vm 的套件需要同名桩。
// 注入到各 vm 沙箱：L / L3 / normLocale 桩（闭包捕获 self，不依赖 this）
// 注入到各 vm 沙箱：L / L3 / normLocale 桩（闭包捕获 self，不依赖 this）
// ★locale 缺省对齐产品默认值 'zh'（源码 `var locale = 'zh'`）；否则未设 locale 的旧沙箱
//   会被 L() 判成非中文 ⇒ 误回落英文、断言假红。
function __mkI18nStub(self) {
  if (!self.locale) self.locale = 'zh'
  self.__L10N = self.__L10N || {}
  self.L = function (a, b) {
    if (self.locale === 'zh') return a
    var m = self.__L10N[self.locale]
    if (m && m[a] !== undefined && m[a] !== '') return m[a]
    return b === undefined ? a : b
  }
  self.L3 = function (a, b, ja) {
    if (self.locale === 'zh') return a
    if (self.locale === 'ja' && ja !== undefined && ja !== null) return ja
    return self.L(a, b)
  }
  self.normLocale = function (v) {
    var s = String(v == null ? '' : v).toLowerCase()
    if (!s) return ''
    var all = ['zh', 'en', 'ja']
    for (var i = 0; i < all.length; i++) {
      if (s === all[i] || s.indexOf(all[i] + '-') === 0 || s.indexOf(all[i] + '_') === 0) return all[i]
    }
    return ''
  }
  return self
}

const src = readFileSync('lib/client.js', 'utf8');
function seg(name, nextName) {
  const a = src.indexOf('    function ' + name + '(');
  const b = nextName ? src.indexOf('\n    function ' + nextName + '(') : src.length;
  if (a < 0 || b <= a) throw new Error('seg fail ' + name);
  return src.slice(a, b);
}
function mk(n) { const f = function () { return { type: n, props: {}, kids: Array.prototype.slice.call(arguments, 2) }; }; f.__name = n; return f; }
function ctx() {
  return {
    h: function (t, p) { return { type: (typeof t === 'function' ? (t.__name || 'fn') : String(t)), props: p || {}, kids: Array.prototype.slice.call(arguments, 2) }; },
    useState: function (v) { const s = typeof v === 'function' ? v() : v; return [s, function () {}]; },
    DAM_RAIL_ITEMS: [{ key: 'home', label: '首页' }, { key: 'timeline', label: '时间轴' }, { key: 'ledger', label: '交接账本' }, { key: 'library', label: '记忆库' }, { key: 'recall', label: '召回审查' }, { key: 'team', label: '团队' }, { key: 'calendar', label: '日历' }, { key: 'settings', label: '设置' }],
    DamRailToolbar: mk('DamRailToolbar'), DamStatBar: mk('DamStatBar'), DamTimelineList: mk('DamTimelineList'),
    KanbanBoard: mk('KanbanBoard'), DamFoldBar: mk('DamFoldBar'),
    apiGet: function () { return Promise.resolve(null); }, API: { kanbanBoard: '/x' },
    currentSessionIdClient: function () { return 's1'; },
  };
}
// 段边界用**各自的下一个函数定义**作终点（块自身锚点）
const railSeg = src.slice(src.indexOf('    function KanbanBoardRail(props) {'), src.indexOf('\n    function KanbanBoard(props) {'));
const panelSeg = src.slice(src.indexOf('    function DamRailPanel(props) {'), src.indexOf('\n    // ── R15d 时间轴列表'));
console.log('KanbanBoardRail 段行数 =', railSeg.split('\n').length, '| DamRailPanel 段行数 =', panelSeg.split('\n').length);
const c = ctx(); __mkI18nStub(c)
vm.createContext(c);
vm.runInContext(railSeg + '\n;globalThis.__R = KanbanBoardRail;', c);
vm.runInContext(panelSeg + '\n;globalThis.__P = DamRailPanel;', c);
const kb = { stats: { today: 51, week: 61, members: 0, archived: 156, fold: { days: 21, count: 9, hasMore: true } }, lanes: [{ key: 'goal', label: '目标', cards: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }, { key: 'state', label: '进行中', cards: [{ id: 'c', title: 'C' }] }] };
let err = null, tree = null;
try { tree = c.__R({ data: kb, zh: true, onOpen: function () {} }); } catch (e) { err = e; }
console.log('① KanbanBoardRail 真渲染:', err ? ('✗ ' + err.message) : '✓ 未抛错');
if (err) process.exit(1);
function types(n, acc) { if (!n || typeof n !== 'object') return acc; if (n.type) acc.push(n.type); (n.kids||[]).forEach(function (k) { if (Array.isArray(k)) k.forEach(function (x) { types(x, acc); }); else types(k, acc); }); return acc; }
const t0 = types(tree, []);
console.log('② 默认(时间轴档)渲染树含:', t0.filter(function (x) { return /^Dam/.test(x) || x === 'KanbanBoard'; }).join(', '));
if (!t0.includes('DamTimelineList')) { console.log('✗ 时间轴档未渲染时间轴列表'); process.exit(1); }
// ★R3 真验证：8 项逐项渲染 DamRailPanel，且 data-dam-rail-view 随 key 变
const views = [];
for (const it of c.DAM_RAIL_ITEMS) {
  if (it.key === 'timeline') continue;
  const p = c.__P({ item: it.key, label: it.label, kb: kb, zh: true });
  views.push(p.props['data-dam-rail-view']);
}
console.log('③ 非时间轴 7 项 data-dam-rail-view =', views.join(','));
const uniq = new Set(views);
if (uniq.size !== 7) { console.log('✗ 视图标识未逐项区分'); process.exit(1); }
// home 档必须真出 KPI（消费 kb.stats）
const home = c.__P({ item: 'home', label: '首页', kb: kb, zh: true });
const ht = types(home, []);
const kpi = (function walk(n, acc) { if (!n || typeof n !== 'object') return acc; if (n.props && n.props['data-dam-rail-kpi']) acc.push(n.props['data-dam-rail-kpi']); (n.kids||[]).forEach(function (k) { if (Array.isArray(k)) k.forEach(function (x) { walk(x, acc); }); else walk(k, acc); }); return acc; })(home, []);
console.log('④ home 档 KPI 项 =', kpi.join(','), '| 含指标块 =', ht.includes('div') || ht.length > 0);
if (kpi.length !== 4) { console.log('✗ KPI 非 4 项'); process.exit(1); }
const led = c.__P({ item: 'ledger', label: '交接账本', kb: kb, zh: true });
const rows = (function walk(n, acc) { if (!n || typeof n !== 'object') return acc; if (n.props && n.props['data-dam-rail-ledger-row'] != null) acc.push(n.props['data-dam-rail-ledger-row']); (n.kids||[]).forEach(function (k) { if (Array.isArray(k)) k.forEach(function (x) { walk(x, acc); }); else walk(k, acc); }); return acc; })(led, []);
console.log('⑤ ledger 档真出行数 =', rows.length, '（kb 里共 3 张卡）');
if (rows.length !== 3) { console.log('✗ ledger 行数不符'); process.exit(1); }
// 负路径：把 panel 的 key 分支打掉 ⇒ home 不再出 KPI
const mut = panelSeg.replace("if (key === 'home') {", "if (false) {");
if (mut === panelSeg) { console.log('✗ 变异未命中'); process.exit(1); }
const c2 = ctx(); __mkI18nStub(c2)
vm.createContext(c2);
vm.runInContext(mut + '\n;globalThis.__P2 = DamRailPanel;', c2);
const h2 = c2.__P2({ item: 'home', label: '首页', kb: kb, zh: true });
const kpi2 = (function walk(n, acc) { if (!n || typeof n !== 'object') return acc; if (n.props && n.props['data-dam-rail-kpi']) acc.push(n.props['data-dam-rail-kpi']); (n.kids||[]).forEach(function (k) { if (Array.isArray(k)) k.forEach(function (x) { walk(x, acc); }); else walk(k, acc); }); return acc; })(h2, []);
console.log('⑥ 负路径(打掉 home 分支): KPI =', kpi2.length, kpi2.length === 0 ? '✓ 精确退化' : '✗ 仍绿');
if (kpi2.length !== 0) process.exit(1);
console.log('=== 守卫通过：rail 8 项真驱动主区 + 时间轴档不降级 ===');