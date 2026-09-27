/**
 * 布局配置(layout-config) —— **配置层核心:纯逻辑 + 零 IO + 零依赖 + 零副作用**。
 *
 * 依据（全量读取后照抄，未自创）:
 *  · docs/teamwork-impl/56-前端线六层重排（可配置化为主线）.md §三「配置形态=配置文件」/ §四「配置层」
 *  · docs/teamwork-impl/28-B12前端拟合第二轮素材.md §3.2 region 7 / §3.3 slot 18 / §3.4 blockKind 10 / §3.1 authorSurface
 *  · docs/teamwork-impl/frontend/layout-schema-v1.json（L2 布局契约,sha256 8f73e408…）
 *
 * 验收判据（56 卷 §三,可复算,本模块是它们的唯一实现面）:
 *  ① 正路径:删掉配置文件 ⇒ 结果与默认**完全一致**
 *  ② 正路径:改一个 region 的 order ⇒ 该区域换位,其余不动
 *  ③ 负路径:写了不存在的 region 名 ⇒ **不崩**,忽略该项并留一行告警
 *  ④ 负路径:JSON 语法错 ⇒ **不崩**,回落默认布局
 *
 * 纪律:**fail-safe 不是 fail-closed** —— 客户改错配置不允许让界面崩掉(与皮肤契约的
 * fail-closed「未知字段 hard error」不同:那是皮肤作者声明,这是客户手改的配置)。
 */

/** region 清单(7) —— 与 layout-schema-v1.json regions 逐条同名同序,顺序即默认 order。 */
export const LAYOUT_REGIONS = Object.freeze(['page', 'float', 'page-nav', 'settings', 'dialog', 'sidebar-entry', 'overlay'])

/** slot 清单(18) —— 与 layout-schema-v1.json slots 逐条同名同序。 */
export const LAYOUT_SLOTS = Object.freeze([
  'head', 'actions', 'nav', 'summary', 'list', 'timeline', 'board', 'graph', 'calendar',
  'detail', 'chart', 'stats-row', 'badge', 'hint', 'form', 'footer', 'empty', 'chart-legend',
])

/** blockKind 清单(10) —— 字符串枚举必须配断言兜底(本仓既有教训:枚举写错编译器不报错)。 */
export const LAYOUT_BLOCK_KINDS = Object.freeze([
  'badge', 'list', 'timeline', 'chart', 'stat', 'actions', 'form', 'prose', 'media', 'empty',
])

/** authorSurface 的 5 项客户操作面(28 卷 §3.1)。 */
export const AUTHOR_SURFACE_KEYS = Object.freeze(['reorder', 'resize', 'visibility', 'aesthetics', 'imagery'])

/** 配置契约版本(写进配置文件;版本不符时只告警不拒绝,保证前向兼容)。 */
export const LAYOUT_CONFIG_VERSION = 1

/** 配置文件名 —— 与 team-attribution.json 同级(都落 dshHome()),由宿主拼路径。 */
export const LAYOUT_CONFIG_FILE = 'layout-config.json'

/** slot 与 region 的从属关系(用于「改 region 只影响自己」与孤儿检测)。 */
export const SLOT_REGION_OF = Object.freeze({
  head: 'page', actions: '*', nav: 'page-nav', summary: 'page', list: 'page',
  timeline: 'page', board: 'page', graph: 'page', calendar: 'page', detail: 'page',
  chart: 'page', 'stats-row': 'page', badge: '*', hint: '*', form: 'settings',
  footer: 'page', empty: '*', 'chart-legend': 'page',
})

/** 从零构造默认配置:**空覆盖**(不是「无配置」)—— 删配置与空配置必须等价。 */
export function defaultLayoutConfig() {
  const regions = {}
  for (let i = 0; i < LAYOUT_REGIONS.length; i++) {
    regions[LAYOUT_REGIONS[i]] = { }
  }
  const slots = {}
  for (let i = 0; i < LAYOUT_SLOTS.length; i++) {
    slots[LAYOUT_SLOTS[i]] = { }
  }
  const blocks = {}
  for (let i = 0; i < LAYOUT_BLOCK_KINDS.length; i++) {
    blocks[LAYOUT_BLOCK_KINDS[i]] = { }
  }
  return {
    version: LAYOUT_CONFIG_VERSION,
    regions: regions,
    slots: slots,
    blocks: blocks,
    tokens: {},
    hidden: [],
  }
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Array]'
}

/** 安全取整数:非数字/NaN/小数一律回落默认,不抛。 */
function safeInt(v, fallback) {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v)
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (isFinite(n)) return Math.round(n)
  }
  return fallback
}

/** 安全取字符串:仅接受非空字符串,其余回落空串。 */
function safeText(v) {
  if (typeof v !== 'string') return ''
  let s = v
  try { s = s.trim() } catch (_) { return '' }
  return s
}

/**
 * ★配置层心脏:把**任意输入**(客户手改的 JSON、坏 JSON 解析后的 null、undefined)
 * 归一化为一个**始终可用**的配置对象,并收集告警。
 *
 * 硬约束(fail-safe,56 卷 §三验收判据的①②③④):
 *  · 永不抛异常 —— 任何输入都返回可用对象
 *  · 未知键 → **忽略该项 + 一条告警**(判据③)
 *  · 语法错(传入 null/非对象)→ **回落默认 + 一条告警**(判据④)
 *  · 删配置 / 空对象 → 与 defaultLayoutConfig() **深度相等**(判据①)
 *  · 只改一个 region 的 order ⇒ 其余 region/slot **逐字节不变**(判据②)
 *
 * @param {*} raw    解析后的原始配置(可为 null / 字符串 / 数组 / 任意垃圾)
 * @returns {{ok:boolean, config:object, warnings:string[]}}
 */
export function normalizeLayoutConfig(raw) {
  const warnings = []
  const base = defaultLayoutConfig()
  if (raw === null || raw === undefined) {
    return { ok: true, config: base, warnings: warnings }   // 判据①④:没配置=默认,不算错
  }
  if (!isPlainObject(raw)) {
    warnings.push('layout-config: 顶层不是对象（收到 ' + typeof raw + '），已回落默认配置')
    return { ok: false, config: base, warnings: warnings }
  }

  // version:只在不是 1 时告警,不拒绝 —— 前向兼容
  const ver = safeInt(raw.version, LAYOUT_CONFIG_VERSION)
  if (ver !== LAYOUT_CONFIG_VERSION) {
    warnings.push('layout-config: version=' + ver + ' 与当前契约 ' + LAYOUT_CONFIG_VERSION + ' 不符,已按当前契约解析')
  }

  const config = defaultLayoutConfig()
  config.version = LAYOUT_CONFIG_VERSION

  // ---------- regions ----------
  if (raw.regions !== undefined) {
    if (!isPlainObject(raw.regions)) {
      warnings.push('layout-config: regions 不是对象,已忽略整块')
    } else {
      const names = Object.keys(raw.regions)
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        if (LAYOUT_REGIONS.indexOf(name) < 0) {
          warnings.push('layout-config: 未知 region「' + name + '」,已忽略该项')   // 判据③
          continue
        }
        const spec = raw.regions[name]
        if (!isPlainObject(spec)) {
          warnings.push('layout-config: region「' + name + '」的值不是对象,已忽略')
          continue
        }
        const out = {}
        if (spec.order !== undefined) {
          const before = spec.order
          out.order = safeInt(spec.order, 0)
          if (typeof before !== 'number') {
            warnings.push('layout-config: region「' + name + '」.order 非数字,已按 ' + out.order + ' 处理')
          }
        }
        for (const dim of ['w', 'h', 'min']) {
          if (spec[dim] !== undefined) {
            const s = safeText(spec[dim])
            if (s) out[dim] = s
            else warnings.push('layout-config: region「' + name + '」.' + dim + ' 不是有效尺寸,已忽略')
          }
        }
        if (spec.hidden !== undefined) {
          if (spec.hidden === true || spec.hidden === false) out.hidden = spec.hidden
          else warnings.push('layout-config: region「' + name + '」.hidden 非布尔,已忽略')
        }
        if (Object.keys(out).length > 0) config.regions[name] = out
      }
    }
  }

  // ---------- slots ----------
  if (raw.slots !== undefined) {
    if (!isPlainObject(raw.slots)) {
      warnings.push('layout-config: slots 不是对象,已忽略整块')
    } else {
      const names = Object.keys(raw.slots)
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        if (LAYOUT_SLOTS.indexOf(name) < 0) {
          warnings.push('layout-config: 未知 slot「' + name + '」,已忽略该项')
          continue
        }
        const spec = raw.slots[name]
        if (!isPlainObject(spec)) {
          warnings.push('layout-config: slot「' + name + '」的值不是对象,已忽略')
          continue
        }
        const out = {}
        if (spec.order !== undefined) out.order = safeInt(spec.order, 0)
        if (spec.hidden !== undefined) {
          if (spec.hidden === true || spec.hidden === false) out.hidden = spec.hidden
          else warnings.push('layout-config: slot「' + name + '」.hidden 非布尔,已忽略')
        }
        if (Object.keys(out).length > 0) config.slots[name] = out
      }
    }
  }

  // ---------- tokens:只允许 --dam-* 前缀(客户改配色/圆角走 token) ----------
  if (raw.tokens !== undefined) {
    if (!isPlainObject(raw.tokens)) {
      warnings.push('layout-config: tokens 不是对象,已忽略整块')
    } else {
      const keys = Object.keys(raw.tokens)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        if (k.indexOf('--dam-') !== 0 && k.indexOf('--skin-') !== 0) {
          warnings.push('layout-config: token「' + k + '」前缀非法（须 --dam- 或 --skin-）,已忽略')
          continue
        }
        const v = safeText(raw.tokens[k])
        if (v) config.tokens[k] = v
        else warnings.push('layout-config: token「' + k + '」值为空,已忽略')
      }
    }
  }

  // ---------- blocks:按 blockKind 配置块外观(--dam-block-style)与背景图(--dam-block-bg) ----------
  // 依据 28 卷 §3.4(10 类 kind 取值受控)/ §3.5 方式 C(--dam-block-style 消费点)/ §3.6(authorSurface.imagery)。
  // 与 regions/slots 同款 fail-safe:未知 kind 忽略留告警、非对象忽略、空值忽略,永不抛。
  if (raw.blocks !== undefined) {
    if (!isPlainObject(raw.blocks)) {
      warnings.push('layout-config: blocks 不是对象,已忽略整块')
    } else {
      const kinds = Object.keys(raw.blocks)
      for (let i = 0; i < kinds.length; i++) {
        const kind = kinds[i]
        if (LAYOUT_BLOCK_KINDS.indexOf(kind) < 0) {
          warnings.push('layout-config: 未知 blockKind「' + kind + '」,已忽略该项')
          continue
        }
        const spec = raw.blocks[kind]
        if (!isPlainObject(spec)) {
          warnings.push('layout-config: blockKind「' + kind + '」的值不是对象,已忽略')
          continue
        }
        const out = {}
        const style = safeText(spec.style)
        if (style) out.style = style
        else if (spec.style !== undefined) warnings.push('layout-config: blockKind「' + kind + '」.style 不是有效值,已忽略')
        const bg = safeText(spec.bg)
        if (bg) out.bg = bg
        else if (spec.bg !== undefined) warnings.push('layout-config: blockKind「' + kind + '」.bg 不是有效值,已忽略')
        if (Object.keys(out).length > 0) config.blocks[kind] = out
      }
    }
  }

  // ---------- hidden:便捷数组写法(等价于 region/slot.hidden=true) ----------
  if (raw.hidden !== undefined) {
    if (Object.prototype.toString.call(raw.hidden) === '[object Array]') {
      for (let i = 0; i < raw.hidden.length; i++) {
        const name = safeText(raw.hidden[i])
        if (!name) continue
        if (LAYOUT_REGIONS.indexOf(name) >= 0) { config.regions[name].hidden = true; continue }
        if (LAYOUT_SLOTS.indexOf(name) >= 0) { config.slots[name].hidden = true; continue }
        warnings.push('layout-config: hidden 里的「' + name + '」既不是 region 也不是 slot,已忽略')
      }
    } else {
      warnings.push('layout-config: hidden 不是数组,已忽略')
    }
  }

  return { ok: warnings.length === 0, config: config, warnings: warnings }
}
