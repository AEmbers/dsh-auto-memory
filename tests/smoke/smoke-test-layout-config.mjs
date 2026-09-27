/**
 * smoke-test-layout-config —— 配置层（56 卷「配置层」）CR-10 验收套件。
 *
 * 纪律（CR-10）：**真 import → 真调用 → 断言返回值**；每条判据必带**负路径**；
 * 给出**可复算物理量**；不以「源码含某字符串」充当功能验收。
 *
 * 覆盖 56 卷 §三 四条验收判据：
 *  ① 删配置 ⇒ 与默认完全一致   ② 改一个 region 的 order ⇒ 只该区域变
 *  ③ 未知 region 名 ⇒ 不崩 + 告警   ④ JSON 语法错 ⇒ 不崩 + 回落默认
 */
import { normalizeLayoutConfig, defaultLayoutConfig, LAYOUT_REGIONS, LAYOUT_SLOTS, LAYOUT_BLOCK_KINDS, LAYOUT_CONFIG_FILE, LAYOUT_CONFIG_VERSION } from '../../lib/layout-config.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log("  [PASS] " + msg) } else { fail++; console.log("  [FAIL] " + msg) } }
const J = (o) => JSON.stringify(o)
const eq = (a, b) => J(a) === J(b)

console.log("=== smoke-test-layout-config ===")

// §1 常量规模（对照 docs/teamwork-impl/frontend/layout-schema-v1.json）
console.log("[1] 常量规模")
ok(LAYOUT_REGIONS.length === 7, "region 7 个（实测 " + LAYOUT_REGIONS.length + "）")
ok(LAYOUT_SLOTS.length === 18, "slot 18 个（实测 " + LAYOUT_SLOTS.length + "）")
ok(LAYOUT_BLOCK_KINDS.length === 10, "blockKind 10 种（实测 " + LAYOUT_BLOCK_KINDS.length + "）")
ok(LAYOUT_CONFIG_VERSION === 1, "契约版本 = 1")
ok(LAYOUT_CONFIG_FILE === "layout-config.json", "配置文件名 = layout-config.json")
ok(Object.isFrozen(LAYOUT_REGIONS) && Object.isFrozen(LAYOUT_SLOTS) && Object.isFrozen(LAYOUT_BLOCK_KINDS), "三个清单均被 Object.freeze 冻结")

// §2 判据① 删配置 / 空配置 ⇒ 与默认完全一致（正路径）
console.log("[2] 判据① 无配置 ⇒ 默认（正路径）")
const base = defaultLayoutConfig()
ok(eq(normalizeLayoutConfig(undefined).config, base), "undefined ⇒ 深度等于默认")
ok(eq(normalizeLayoutConfig(null).config, base), "null ⇒ 深度等于默认")
ok(eq(normalizeLayoutConfig({}).config, base), "{} ⇒ 深度等于默认")
ok(normalizeLayoutConfig(undefined).ok === true, "undefined ⇒ ok:true（无配置不是错误）")
ok(normalizeLayoutConfig(null).ok === true, "null ⇒ ok:true")
ok(normalizeLayoutConfig({}).ok === true, "{} ⇒ ok:true")
ok(normalizeLayoutConfig(undefined).warnings.length === 0, "无配置 ⇒ 零告警")

// §3 判据② 改一个 region 的 order ⇒ 只该区域变（正路径 + 隔离断言）
console.log("[3] 判据② 单点改动隔离性")
const r2 = normalizeLayoutConfig({ regions: { page: { order: 99 } } })
ok(r2.config.regions.page.order === 99, "page.order ⇒ 99")
ok(eq(r2.config.regions.float, base.regions.float), "其余 region（float）逐字节不变")
ok(eq(r2.config.regions.settings, base.regions.settings), "其余 region（settings）逐字节不变")
ok(eq(r2.config.slots, base.slots), "slots 整块不受影响")
ok(eq(r2.config.tokens, base.tokens), "tokens 整块不受影响")
ok(r2.ok === true && r2.warnings.length === 0, "合法配置 ⇒ ok:true 且零告警")

// §4 判据③ 未知 region 名 ⇒ 不崩 + 一行告警（负路径）
console.log("[4] 判据③ 未知键 ⇒ 忽略 + 告警（负路径）")
const r3 = normalizeLayoutConfig({ regions: { zzz_not_exist: { order: 1 }, page: { order: 5 } } })
ok(r3.config.regions.page.order === 5, "同批次里的合法项仍生效")
ok(r3.config.regions.zzz_not_exist === undefined, "未知 region 未被写入")
ok(r3.warnings.length === 1, "恰好 1 条告警（实测 " + r3.warnings.length + "）")
ok(r3.warnings[0] && r3.warnings[0].indexOf("zzz_not_exist") >= 0, "告警文本含未知键名")
ok(r3.ok === false, "有告警 ⇒ ok:false")
const r3b = normalizeLayoutConfig({ slots: { nope: { order: 1 } } })
ok(r3b.config.slots.nope === undefined && r3b.warnings.length === 1, "未知 slot ⇒ 同样忽略+告警")

// §5 判据④ 语法错 / 垃圾输入 ⇒ 不崩 + 回落默认（负路径）
console.log("[5] 判据④ 垃圾输入 ⇒ 回落默认（负路径）")
const junk = ["not-an-object", 42, true, false, [], [1, 2], () => {}]
for (const j of junk) {
  const r = normalizeLayoutConfig(j)
  ok(eq(r.config, base), "垃圾输入 " + String(j).slice(0, 12) + " ⇒ 回落默认")
  ok(r.warnings.length >= 1, "  └ 且至少 1 条告警")
  ok(r.ok === false, "  └ 且 ok:false")
}

// §6 类型错 / 前缀非法 / 空值（负路径 + 严格性）
console.log("[6] 类型与取值严格性")
const r6 = normalizeLayoutConfig({
  version: 99,
  regions: { page: { order: "abc", w: 123, h: "   ", hidden: "yes" } },
  slots: { head: { order: 3.7, hidden: true } },
  tokens: { "color-bad": "#fff", "--dam-accent": "#4A90D9", "--skin-x": "" },
  hidden: ["page", "zzz_nope"],
})
ok(r6.config.version === 1, "version 99 ⇒ 归一为 1（只告警不拒绝）")
ok(r6.config.regions.page.order === 0, "order:'abc' ⇒ 0（非数字回落）")
ok(r6.config.regions.page.w === undefined, "w:123 非字符串 ⇒ 丢弃")
ok(r6.config.regions.page.h === undefined, "h 空白串 ⇒ 丢弃")
const r6h = normalizeLayoutConfig({ regions: { page: { hidden: 'yes' } } })
ok(r6h.config.regions.page.hidden === undefined, "hidden:'yes' 非布尔 ⇒ 忽略（不写 false）")
ok(r6h.warnings.some(w => w.indexOf('非布尔') >= 0), "  └ 且给出非布尔告警")
ok(r6.config.regions.page.hidden === true, "同输入里 hidden 数组项 page 优先 ⇒ hidden:true")
ok(r6.config.slots.head.order === 4, "order:3.7 ⇒ 4（四舍五入）")
ok(r6.config.slots.head.hidden === true, "hidden:true ⇒ true")
ok(r6.config.tokens["--dam-accent"] === "#4A90D9", "合法 --dam- token 保留")
ok(r6.config.tokens["color-bad"] === undefined, "非法前缀 token ⇒ 丢弃")
ok(r6.config.tokens["--skin-x"] === undefined, "空值 token ⇒ 丢弃")
ok(r6.config.regions.page.hidden === true, "hidden 数组项 page ⇒ region 生效")
ok(r6.warnings.length >= 6, "告警条数 >= 6（实测 " + r6.warnings.length + "）")

// §7 幂等性（防不稳定归一化）
console.log("[7] 幂等性")
const once = normalizeLayoutConfig({ regions: { page: { order: 7 } } }).config
ok(eq(normalizeLayoutConfig(once).config, once), "normalize(normalize(x)) === normalize(x)")
ok(eq(normalizeLayoutConfig(base).config, base), "对默认值再归一化 ⇒ 不变（无漂移）")

// §8 全量 slot 可写（容量断言）
console.log("[8] 18 slot 全量可写")
const allSlots = {}
LAYOUT_SLOTS.forEach((s, i) => { allSlots[s] = { order: i } })
const r8 = normalizeLayoutConfig({ slots: allSlots })
ok(Object.keys(r8.config.slots).length === 18, "18 个 slot 全部写入（实测 " + Object.keys(r8.config.slots).length + "）")
ok(r8.warnings.length === 0, "全合法输入 ⇒ 零告警")

// §9 物理量（可复算，供报告引用）
console.log("[9] 物理量")
const phys = normalizeLayoutConfig({ regions: { page: { order: 99 } }, tokens: { "--dam-accent": "red" } })
ok(Object.keys(base.regions).length === 7, "默认 regions 键数 = " + Object.keys(base.regions).length)
ok(Object.keys(base.slots).length === 18, "默认 slots 键数 = " + Object.keys(base.slots).length)
ok(J(base).length > 300, "默认配置序列化长度 = " + J(base).length + " 字符")
ok(phys.warnings.length === 0, "合法输入告警数 = 0")

console.log("")
console.log("PASS " + pass + " / FAIL " + fail)
process.exit(fail === 0 ? 0 : 1)
