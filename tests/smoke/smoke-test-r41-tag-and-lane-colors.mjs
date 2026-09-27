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
function mkLane(n) { var f = function () { return arguments[0]; }; f.__name = n; return f; }
function mkCtx() {
  return {
    h: function (t, p) { return { type: (typeof t === 'function' ? (t.__name || 'fn') : String(t)), props: p || {}, kids: Array.prototype.slice.call(arguments, 2) }; },
    useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
    KX_LANE_COLOR: { goal: 'var(--dam-lane-goal, #4A90D9)', state: 'var(--dam-lane-state, #48B784)', deadend: 'var(--dam-lane-deadend, #E05C5C)', progress: 'var(--dam-lane-progress, #8B7FE8)', archive: 'var(--dam-lane-archive, #7A8290)', misc: 'var(--dam-lane-misc, #6b7280)' },
    kxLaneColor: function (k) { var m = { goal: 'var(--dam-lane-goal, #4A90D9)', progress: 'var(--dam-lane-progress, #8B7FE8)', misc: 'var(--dam-lane-misc, #6b7280)' }; return m[k] || m.misc; },
  };
}
const seg = src.slice(src.indexOf('    function DamTimelineCard(props) {'), src.indexOf('\n    function DamTimelineList(props) {'));
console.log('DamTimelineCard 段行数 =', seg.split('\n').length);
const c = mkCtx(); __mkI18nStub(c)
vm.createContext(c);
vm.runInContext(seg + '\n;globalThis.__C = DamTimelineCard;', c);
function walk(n, f, acc) { acc = acc || []; if (!n || typeof n !== 'object') return acc; if (n.props) f(n, acc); (n.kids || []).forEach(function (k) { if (Array.isArray(k)) { k.forEach(function (x) { walk(x, f, acc); }); } else { walk(k, f, acc); } }); return acc; }
let err = null, tree = null;
const card = { id: 'x1', mtime: 1790480000000, laneLabel: '进度与下一步', section: '前端线', title: 'T', preview: 'P', summary: 'S', tags: ['type:progress', 'sec:前端线', 'frontend'], bullets: 2, chars: 100 };
try { tree = c.__C({ card: card, laneKey: 'progress', laneLabel: '进度与下一步', zh: true }); } catch (e) { err = e; }
console.log('① 真渲染:', err ? ('✗ ' + err.message) : '✓ 未抛错');
if (err) process.exit(1);
// ★判据1：data-dam-tag 只含 tags 字段（sec: 已滤），不含 kind 混入
const tags = walk(tree, function (n, a) { if (n.props['data-dam-tag'] != null) a.push(n.props['data-dam-tag']); });
console.log('② data-dam-tag 取样 =', JSON.stringify(tags));
const bad = tags.filter(function (t) { return String(t).indexOf('sec:') === 0; });
console.log('   含 sec: 前缀的 =', bad.length, bad.length === 0 ? '✓' : '✗');
if (bad.length) process.exit(1);
if (tags.length !== 2) { console.log('✗ 标签数应为 2（sec: 被滤掉）'); process.exit(1); }
// ★判据2：标签颜色 = 蓝色 #4A90D9（非琥珀）
const tagColors = walk(tree, function (n, a) { if (n.props['data-dam-tag'] != null) a.push(n.props.style && n.props.style.color); });
console.log('③ 标签颜色 =', JSON.stringify(tagColors));
const isBlue = tagColors.every(function (x) { return String(x).indexOf('--dam-lane-goal, #4A90D9') >= 0; });
console.log('   全部指向 #4A90D9 =', isBlue ? '✓' : '✗');
if (!isBlue) process.exit(1);
// ★负路径：把 tags 过滤打掉 ⇒ sec: 混入必现
const mut = seg.replace(".filter(function (x) { return String(x || '').indexOf('sec:') !== 0 })", '');
if (mut === seg) { console.log('✗ 变异未命中'); process.exit(1); }
const c2 = mkCtx(); __mkI18nStub(c2)
vm.createContext(c2);
vm.runInContext(mut + '\n;globalThis.__C2 = DamTimelineCard;', c2);
const t2 = c2.__C2({ card: card, laneKey: 'progress', laneLabel: 'x', zh: true });
const tags2 = walk(t2, function (n, a) { if (n.props['data-dam-tag'] != null) a.push(n.props['data-dam-tag']); });
const sec2 = tags2.filter(function (t) { return String(t).indexOf('sec:') === 0; });
console.log('④ 负路径(去掉 sec: 过滤): sec 混入 =', sec2.length, sec2.length > 0 ? '✓ 精确变异' : '✗ 恒绿');
if (sec2.length === 0) process.exit(1);
console.log('=== 守卫通过：tag 只取 tags 字段 + 蓝色 #4A90D9 + 负路径可变异 ===');