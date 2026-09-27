/** R23 皮肤中心验收：真 import + 真调用 + 负路径 + 跨层一致锁。 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { SKIN_ASSETS, SKIN_ASSET_KEYS, assetOf } from 'file:///D:/dsh-auto-memory/lib/skin-assets.js'
import { resolveSkinTheme, composeSkinTheme, buildSkinSlots, skinCenterStatus, SKIN_TOKEN_KEYS, isCssSafe } from 'file:///D:/dsh-auto-memory/lib/skin-center.js'
const SRC = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')
const IX = readFileSync('D:/dsh-auto-memory/lib/index.js', 'utf8')
let p = 0, f = 0; const fails = []
const ok = (c, m) => { if (c) p++; else { f++; fails.push(m) } }
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')
const cnt = (s, x) => s.split(x).length - 1
const MEND = '    // ===================== S2-skin:end ====================='

/* ── A. 结构（段与外） ── */
eq(cnt(SRC, MEND), 1, 'A1 ★端段标记仍恰 1 处')
ok(cnt(SRC, 'function SkinCenterPanel') === 1 && cnt(SRC, 'h(SkinCenterPanel,') === 1, 'A2 ★面板 1 定义 + 1 调用')
ok(cnt(SRC, 'function SkinSlotRows') === 1 && cnt(SRC, 'h(SkinSlotRows,') === 1, 'A3 ★槽位回显 1 定义 + 1 调用')
eq(cnt(SRC, 'function useTick'), 1, 'A4 ★复用既有 useTick（未造新钩子）')
eq((SRC.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length, 2, 'A5 计数锁不变')
ok(!/set(Interval|Timeout)\s*\(/.test(SRC.slice(SRC.indexOf('function fetchSkinCenter'), SRC.indexOf('function SkinSlotRows'))), 'A6 ★皮肤段零新增定时器')
ok(cnt(IX, 'skinCenter: _sc') === 1, 'A7 ★宿主把 skinCenter 并入既有 state（未新增路由）')
eq(cnt(IX, 'API.skinCenter'), 0, 'A8 ★零新路由')
ok(cnt(IX, 'function readSkinCenterPre()') === 1 && cnt(IX, 'readSkinCenterPre()') === 2, 'A9 ★宿主读函数 1 定义 + 1 调用')

/* ── B. ★跨层一致锁：前端行 = 宿主表逐字段 ── */
const slots = buildSkinSlots(SKIN_ASSETS, SKIN_ASSET_KEYS)
eq(slots.length, 6, 'B1 槽位行数 = 6')
eq(slots.length, Object.keys(SKIN_ASSETS).length, 'B2 ★行数 = 宿主表键数')
ok(slots.every((r, i) => { const e = SKIN_ASSETS[SKIN_ASSET_KEYS[i]]; return r.key === SKIN_ASSET_KEYS[i] && r.file === e.file && r.fileDark === e.fileDark && r.size[0] === e.size[0] && r.size[1] === e.size[1] }), 'B3 ★★前 6 行与宿主 SKIN_ASSETS 逐字段一致')
ok(slots.every((r) => r.size.length === 2), 'B4 ★每行都带尺寸（12 卷纪律三）')
eq(slots.filter((r) => r.hasDark).length, 2, 'B5 fileDark 非空 = 2（与 53 卷深色素材数一致）')
const st = skinCenterStatus(slots, [], [])
ok(st.usable === true && st.ready === 6 && st.total === 6, 'B6 ★6 槽位全就绪 ⇒ usable')
const slots0 = buildSkinSlots({}, [])
eq(skinCenterStatus(slots0, [], []).usable, false, 'B7 ★负路径：空表 ⇒ 不可用（非恒真）')

/* ── C. ★真实调用：前端两组件在 vm 中真渲染 ── */
const h = function (type, props) { const rest = Array.prototype.slice.call(arguments, 2), kids = []
  const push = (k) => { if (k === null || k === undefined || k === false) return; if (Array.isArray(k)) k.forEach(push); else kids.push(k) }
  rest.forEach(push); return { __el: true, type, props: props || {}, kids } }
// ★R23 段位于 S2-skin:end **之后**（与 R21/R22 不同），单独切片；同时取 S2 段供依赖组件（SkinImg/SkinSlot）
const _iS = SRC.indexOf('    // ===================== S2-skin:begin ====================='), _iE = SRC.indexOf(MEND)
const S2SEG = SRC.slice(_iS, _iE)
const _iR = SRC.indexOf('function fetchSkinCenter')
const _iRend = SRC.indexOf('\n    }\r\n', SRC.indexOf('function SkinSlotRows'))
ok(_iRend > 0, 'A0 ★R23 段终点锚可定位')
const R23SEG = SRC.slice(_iR, _iRend + 8)
const SEG = S2SEG + '\r\n' + R23SEG
const sandbox = { console, h, locale: 'zh', String, Object, Array, JSON, Date, useTick: () => [0, () => {}], apiGet: () => Promise.resolve(null), API: {}, useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect: () => {} }
sandbox.globalThis = sandbox
const ctx = vm.createContext(sandbox)
vm.runInContext(SEG + ';globalThis.__R = { SkinCenterPanel, SkinSlotRows, SkinSlot, SkinHero, SkinImg };', ctx, { filename: 'client.js#S2' })
ok(!!(sandbox.__R && sandbox.__R.SkinCenterPanel), 'C1 ★S2 段含 R23 新段在 vm 中真执行')
const el = sandbox.__R.SkinCenterPanel({})
ok(el && el.props && el.props['data-dam-skin-center'] === '1', 'C2 ★★SkinCenterPanel 真调用返回锚点')
ok(el.kids.some((k) => k && k.props && k.props['data-dam-skin-summary'] === '1'), 'C3 ★真返回含摘要行')
const rows = sandbox.__R.SkinSlotRows({})
ok(rows === null, 'C4 ★负路径：无数据 ⇒ return null（零 DOM 变化，不崩）')

/* ── D. 契约三条 fail-closed（12 卷 §3.3）── */
const good = JSON.stringify({ schemaVersion: 1, name: 'acme', displayName: 'ACME', tokens: { 'color.brand': '#123456', 'nope.x': 'y' } })
const rg = resolveSkinTheme(good, { layer: 'user' })
ok(rg.accepted && rg.tokens['color.brand'] === '#123456', 'D1 合法包接受 + token 生效')
eq(rg.tokens['nope.x'], undefined, 'D2 ★未知键忽略（不整包拒）')
ok(rg.warnings.some((w) => /未知 token/.test(w)), 'D3 ★未知键留警告')
ok(resolveSkinTheme(JSON.stringify({ schemaVersion: 9, name: 'a1', displayName: 'b' }), {}).accepted === false, 'D4 ★★负路径 schemaVersion 未知 ⇒ 整包拒')
ok(resolveSkinTheme('{{', {}).accepted === false, 'D5 ★★负路径 坏 JSON ⇒ 整包拒')
const rbad = resolveSkinTheme(JSON.stringify({ schemaVersion: 1, name: 'a1', displayName: 'b', tokens: { 'color.brand': '#fff', 'color.text': 'zzz' } }), {})
ok(rbad.accepted && rbad.tokens['color.brand'] === '#fff' && rbad.tokens['color.text'] === undefined, 'D6 ★★单 token 非法只忽略该项，其余生效')
ok(isCssSafe('@import "a.css";').ok === false && isCssSafe('a{background:url(http://e/x)}').ok === false && isCssSafe('a{color:#fff}').ok === true, 'D7 ★★CSS 三路：@import 拒 / 外链拒 / 白名单放行')
const c = composeSkinTheme([{ layer: 'team', name: 't', tokens: { 'color.brand': '#111' } }, { layer: 'user', name: 'u', tokens: { 'color.brand': '#222', 'brand.name': 'me' } }])
ok(c.tokens['color.brand'] === '#111' && c.tokens['brand.name'] === 'me' && c.conflict === true, 'D8 ★★三层优先级 团队>用户 + 覆盖可检出')
eq(SKIN_TOKEN_KEYS.length, 42, 'D9 公开 token 清单 = 42（12 卷 §四）')

/* ── E. 守恒 ── */
ok(cnt(SRC, 'data-dam-region') === cnt(SRC, 'data-dam-region') && !/data-dam-block/.test(SEG.slice(SEG.indexOf('function SkinCenterPanel'))), 'E1 ★皮肤新段不引入 block 锚')
ok(cnt(SRC, '\n') === cnt(SRC, '\r\n'), 'E2 纯 CRLF')
console.log('lib/client.js ' + Buffer.byteLength(SRC, 'utf8') + 'B / CRLF ' + (SRC.match(/\r\n/g) || []).length + ' / sha16 ' + createHash('sha256').update(SRC).digest('hex').slice(0, 16).toUpperCase())
console.log('lib/index.js ' + Buffer.byteLength(IX, 'utf8') + 'B / sha16 ' + createHash('sha256').update(IX).digest('hex').slice(0, 16).toUpperCase())
console.log('PASS ' + p + ' / FAIL ' + f)
fails.forEach((x) => console.log('  FAIL: ' + x))
process.exit(f === 0 ? 0 : 1)