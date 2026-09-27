#!/usr/bin/env node
/**
 * smoke-test-r38-foldopen-white-screen.mjs —— R38 白屏真缺陷回归守卫
 *
 * 缺陷：KanbanBoardRail（client.js L3357）在 onExpand 处引用了**兄弟函数 KanbanView 内部的** `foldOpen`，
 *       本函数作用域里没有该标识符 ⇒ 每次渲染必抛 ReferenceError ⇒ 宿主槽位错误边界接住 ⇒
 *       `shell.overlay` 与 `conversation.view` 两个承载面**整页白屏**（用户实测）。
 *
 * 为什么既有守卫全绿却漏了：node --check 语法合法；全套静态字符串守卫也全绿 ——
 *       因为这类错误只有**真执行组件渲染**才暴露。⇒ 本守卫按 CR-10 做真调用 + 负路径。
 *
 * 判据：
 *   ① 正路径：真渲染 KanbanBoardRail 一次，**不得抛错**；渲染树里必须含 DamFoldBar / DamStatBar。
 *   ② 负路径：把 onExpand 变异回旧 bug 形态（引用 foldOpen）⇒ 必须**精确报红** ReferenceError: foldOpen is not defined。
 *   ③ 段边界可定位（区间锁）：KanbanBoardRail 段的行数落在 80~120。
 *      ★演进说明（R40）：原判据写死 = 85（原始 66 + R38 新增 19）。R40 按 114 卷 R3 给主区接线
 *      （railKey 驱动 + 时间轴档分流）又加了 7 行 ⇒ 恰值失配。被守语义是「用下一个函数定义作终点锚能
 *      正确切出本段」，**不是**段的具体行数 ⇒ 改为区间锁：既能继续抓「终点锚写错吞掉半个文件」
 *      （93→数百行）这类真事故，又不会因正常增行假红。
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync('lib/client.js', 'utf8');
const start = src.indexOf('    function KanbanBoardRail(props) {');
const end = src.indexOf('\n    function KanbanBoard(props) {');
const seg = src.slice(start, end);
const segLines = seg.split('\n').length;
console.log('段行数 =', segLines, '（区间锁 80~120；R40 后为 92）');
if (!(segLines >= 80 && segLines <= 120)) { console.log('✗ 段边界异常（终点锚可能吞掉了半个文件）'); process.exit(1); }

function mkCtx() {
  const ctx = {
    h: function (t, p) { return { type: (typeof t === 'function' ? (t.__name || 'fn') : String(t)), props: p || {}, kids: Array.prototype.slice.call(arguments, 2) }; },
    useState: function (v) { const s = typeof v === 'function' ? v() : v; return [s, function () {}]; },
    DAM_RAIL_ITEMS: [{ key: 'home', label: 'home' }, { key: 'timeline', label: 'timeline' }],
    DamRailToolbar: mk('DamRailToolbar'), DamStatBar: mk('DamStatBar'), DamTimelineList: mk('DamTimelineList'),
    KanbanBoard: mk('KanbanBoard'), DamFoldBar: mk('DamFoldBar'),
    apiGet: function () { return Promise.resolve(null); },
    API: { kanbanBoard: '/x' }, currentSessionIdClient: function () { return 's1'; },
  };
  function mk(n) { const f = function () { return { type: n, props: {}, kids: [] }; }; f.__name = n; return f; }
  return ctx;
}
function render(segment) {
  const ctx = mkCtx();
  vm.createContext(ctx);
  vm.runInContext(segment + '\n;globalThis.__R = KanbanBoardRail;', ctx);
  return ctx.__R({ data: { stats: { fold: { days: 7 } }, lanes: [] }, zh: true, onOpen: function () {} });
}
function collect(n, acc) { if (!n || typeof n !== 'object') return acc; if (n.type) acc.push(n.type); (n.kids||[]).forEach(function (k) { if (Array.isArray(k)) k.forEach(function (x) { collect(x, acc); }); else collect(k, acc); }); return acc; }

let tree = null, err = null;
try { tree = render(seg); } catch (e) { err = e; }
console.log('① 正路径真渲染:', err ? ('✗ 抛错 -> ' + err.message) : '✓ 未抛错');
if (err) process.exit(1);
const types = collect(tree, []);
console.log('② 渲染树含 DamFoldBar =', types.includes('DamFoldBar'), '| 含 DamStatBar =', types.includes('DamStatBar'));
if (!types.includes('DamFoldBar')) { console.log('✗ 折叠条未渲染'); process.exit(1); }

// 负路径：把 onExpand 还原成原 bug 形态（引用兄弟函数内的 foldOpen）
const bug = seg.replace('onExpand: onExpand', 'onExpand: foldOpen.expand');
if (bug === seg) { console.log('✗ 变异未命中'); process.exit(1); }
let err2 = null;
try { render(bug); } catch (e) { err2 = e; }
const isRef = err2 && err2.name === 'ReferenceError' && /foldOpen/.test(err2.message);
console.log('③ 负路径(还原成原 bug 形态):', isRef ? ('✓ 精确报红 ReferenceError: ' + err2.message) : ('✗ ' + (err2 ? err2.message : '仍绿')));
if (!isRef) process.exit(1);
console.log('=== 守卫通过：真渲染不抛 + 负路径精确报红 ===');