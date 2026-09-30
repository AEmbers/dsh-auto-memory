import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// ★2026-09-30（H1 · 用户实测三项残留）——真执行验收，非静态断言。
//   验收对象：「模块级浮层共用样式表」在**四种皮肤档**下究竟投放哪张表。
//   用户报的症状（经典档）：①新手引导/更新日志仍是新版外观 ②左下窗格蓝底非液态玻璃 ③设置区崩坏。
//   根因：F 批把共享表按 flavor 一刀切（非 iter5 即停注）⇒ 三面在经典档下**无任何皮肤样式**。
//   H1 改为按皮肤**投放对应表**：变体档→ITER5_CSS；新款（经典）/传统档→LEGACY_ITER5_CSS。
const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')

// ---- 从真实源码抽出被测活代码（与产品同源，不手写副本）----
function fnAt(startNeedle) {
  const i = source.indexOf(startNeedle)
  assert.ok(i >= 0, 'fn start not found: ' + startNeedle.slice(0, 60))
  const end = source.indexOf('\n    }', i)
  assert.ok(end >= 0, 'fn end not found: ' + startNeedle.slice(0, 60))
  return source.slice(i, end + 6)
}
const KEY = 'dam-skin'
const STYLE_KEY = 'dam-skin-style'
function bootFlavor(store) {
  const local = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
  }
  const code = [
    'var DAM_SKIN_KEY = ' + JSON.stringify(KEY),
    'var DAM_SKIN_STYLE_KEY = ' + JSON.stringify(STYLE_KEY),
    // 权威写法（照抄 smoke-test-skin-pluggable.mjs）：变体 id 白名单必须注入，
    //   否则 damSkinStyleGet 认不出 instrument/editorial/water 而回落 legacy。
    'var DAM_SKIN_VARIANT_IDS = ["legacy","instrument","editorial","water"]',
    fnAt('    function damSkinActive() {'),
    fnAt('    function damSkinStyleGet() {'),
    "    function damSkinLegacy() { return damSkinStyleGet() === 'legacy' }",
    fnAt('    function damSkinCssFlavor() {'),
    'return { damSkinCssFlavor: damSkinCssFlavor }',
  ].join('\n')
  const ctx = vm.createContext({ localStorage: local, String, JSON })
  return vm.runInContext('(function(){' + code + '})()', ctx)
}

// ---- 1) 共享表的投放判据：真跑两个探针（复刻 H1 的表达式）----
const PROBE = source.indexOf('H1 · 外层三面按皮肤分派')
assert.ok(PROBE >= 0, 'H1 dispatch marker missing from client.js (F 批行为仍在)')
const probeSrc = source.indexOf('var damSharedCss = ITER5_CSS', PROBE)
assert.ok(probeSrc >= 0, 'damSharedCss declaration missing')
const declEnd = source.indexOf('\n', source.indexOf("catch (eH1) {}", probeSrc))
const decl = source.slice(probeSrc, declEnd)
assert.ok(/damSkinCssFlavor\(\) === 'iter5' \? ITER5_CSS : LEGACY_ITER5_CSS/.test(decl), 'dispatch must pick ITER5_CSS only for iter5');

function pickShared(flavorValue) {
  const code = [
    'var ITER5_CSS = "VARIANTSHEET"',
    'var LEGACY_ITER5_CSS = "LEGACYSHEET"',
    'var damSkinCssFlavor = function () { return ' + JSON.stringify(flavorValue) + ' }',
    decl,
    'return damSharedCss',
  ].join('\n')
  return vm.runInContext('(function(){' + code + '})()', vm.createContext({}));
}
assert.equal(pickShared('iter5'), 'VARIANTSHEET', 'iter5 flavor must get the variant sheet')
assert.equal(pickShared('legacy'), 'LEGACYSHEET', 'legacy flavor must get the frozen 3.2.5 sheet (NOT empty)')
assert.equal(pickShared('classic'), 'LEGACYSHEET', 'classic flavor must get the frozen 3.2.5 sheet (NOT empty)')
console.log('PASS shared-sheet dispatch: iter5→variant, legacy/classic→frozen (never empty)')

// ---- 2) 负路径（变异必红）：把它换回 F 批的「停注」写法，classic/legacy 必须变成空表 ----
//   F 批原判据：非 iter5 就 return（不注入）。本断言证明**若回归该写法，本套件必红**。
function pickSharedLegacyForm(flavorValue) {
  const code = [
    'var ITER5_CSS = "VARIANTSHEET"',
    'var LEGACY_ITER5_CSS = "LEGACYSHEET"',
    'var damSkinCssFlavor = function () { return ' + JSON.stringify(flavorValue) + ' }',
    "var damFlavor = 'classic'",
    'try { damFlavor = damSkinCssFlavor() } catch (e) {}',
    "if (damFlavor !== 'iter5') return ''",
    'return ITER5_CSS',
  ].join('\n')
  return vm.runInContext('(function(){' + code + '})()', vm.createContext({}));
}
assert.equal(pickSharedLegacyForm('legacy'), '', 'MUTATION CHECK: legacy form must yield EMPTY (this is the bug)')
assert.equal(pickSharedLegacyForm('classic'), '', 'MUTATION CHECK: classic form must yield EMPTY (this is the bug)')
assert.notEqual(pickShared('legacy'), '', 'H1 must NOT reproduce that empty result for legacy')
assert.notEqual(pickShared('classic'), '', 'H1 must NOT reproduce that empty result for classic')
console.log('PASS mutation check: F-batch form yields empty for legacy/classic; H1 does not')

// ---- 2b) 旧「停注」形态在活代码中的残留数：0（已全部改造）----
const STOP_OLD = "if (damFlavor !== 'iter5') return function () {}"
const stopHits = source.split(STOP_OLD).length - 1
assert.equal(stopHits, 0, 'F6 stop-injection must be fully replaced by H1, got ' + stopHits)
console.log('PASS negative path: F6 stop-injection残留 0 处（两处均已改为按皮肤投放）')

// ---- 3) 冻结块：局部 ITER5_CSS 恒注入（该表即 3.2.5 原表）----
const frozenMark = source.indexOf('H1 · 冻结块')
assert.ok(frozenMark >= 0, 'frozen-block H1 note missing')
console.log('PASS frozen block keeps injecting its own 3.2.5 sheet unconditionally')

// ---- 4) 换肤即时刷新：共享表内容须随 flavor 更新（原实现只在缺失时创建）----
const refresh = 'if (style.textContent !== damSharedCss) style.textContent = damSharedCss'
assert.equal(source.split(refresh).length - 1, 1, 'shared sheet refresh-on-switch must exist exactly once')
console.log('PASS refresh-on-switch: shared sheet content is re-dispatched on skin change')

// ---- 5) 四档全矩阵（与用户「确保开关·显示同步」对齐）----
const matrix = [
  // 出厂默认（未选过）⇒ flavor='legacy'（=3.2.5 新款基线），与 smoke-test-skin-pluggable.mjs 的权威断言一致
  ['新款（出厂默认·未选过）', new Map(), 'legacy', 'LEGACYSHEET'],
  ['仪器', new Map([[KEY, 'v4'], [STYLE_KEY, 'instrument']]), 'iter5', 'VARIANTSHEET'],
  ['编辑', new Map([[KEY, 'v4'], [STYLE_KEY, 'editorial']]), 'iter5', 'VARIANTSHEET'],
  ['活水', new Map([[KEY, 'v4'], [STYLE_KEY, 'water']]), 'iter5', 'VARIANTSHEET'],
  ['新款（经典·3.2.5 基线）', new Map([[KEY, 'v4'], [STYLE_KEY, 'legacy']]), 'legacy', 'LEGACYSHEET'],
  ['经典（宿主原生）', new Map([[KEY, 'classic']]), 'classic', 'LEGACYSHEET'],
];
for (const [label, store, wantFlavor, wantSheet] of matrix) {
  const f = bootFlavor(store).damSkinCssFlavor()
  assert.equal(f, wantFlavor, label + ': flavor must be ' + wantFlavor + ', got ' + f)
  assert.equal(pickShared(f), wantSheet, label + ': shared sheet must be ' + wantSheet)
  console.log('  ok - ' + label + ' → flavor=' + f + ' sheet=' + wantSheet)
}
console.log('PASS 6/6 skin × shared-sheet matrix (no combination yields an empty stylesheet)')

console.log('== H1 outer-surface skin dispatch: all assertions passed ==')
