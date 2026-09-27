/**
 * 阶段 1/3：i18n 基础设施 + locale 管道（不碰 728 个调用点，那留给阶段 2）
 *
 * 设计（用户裁定「字典查表式，为以后加语言」）：
 *   · t('key')      → I18N[locale][key]，新增语言 = 加一个 <lang> 对象
 *   · L(中文, 英文)  → 新增语言 = 往 L10N[lang] 加一份「中文原串 → 译文」表，**调用点零改动**
 *   · L3(中, 英, 日) → 逃生口，仅当日语档缺字典项时用
 *
 * 幂等：以 `var L10N = {` 是否已存在判定；命中则整体跳过。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = 'D:/dsh-auto-memory/lib/client.js'
const raw = readFileSync(FILE, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'

if (raw.includes('var L10N = {') || raw.includes('function L(a, b) {')) {
  throw new Error('已打过基础设施补丁（检测到 L10N/L 定义），拒绝重复执行')
}

const dictJa = JSON.parse(readFileSync('D:/dsh-auto-memory/tools/i18n/seed-dict-ja.json', 'utf8'))
const inlineJa = JSON.parse(readFileSync('D:/dsh-auto-memory/tools/i18n/seed-inline-ja.json', 'utf8'))

const lines = raw.split(eol)
const countOf = (s) => raw.split(s).length - 1
const uniqueAnchor = (s, where) => {
  const n = countOf(s)
  if (n !== 1) throw new Error(`${where}: 锚点命中 ${n} 次（期望 1）: ${JSON.stringify(s.slice(0, 70))}`)
  return lines.findIndex((l) => l === s || (s.includes(eol) && lines.join(eol).indexOf(s) >= 0))
}

// ── 锚点 A：`    var locale = 'zh'` 之前插入 多语言基础设施 ──
const ANCHOR_A = "    var locale = 'zh'"
const idxA = lines.findIndex((l) => l === ANCHOR_A)
if (idxA < 0) throw new Error('锚点 A 未找到')
const INFRA = [
  "    // ───────────────── 多语言（zh / en / ja） ─────────────────",
  "    // ★2026-09-28：加第 4 种语言的成本 = 只加一份字典，**调用点零改动**。面板文案两类来源：",
  "    //   ① 键值档 I18N.<lang>[key]（t('key') 读）——加语言 = 加一个 <lang> 对象；",
  "    //   ② 内联档源码里的 L(中文, English)（原 `locale === 'zh' ? 中文 : English`）——",
  "    //      第三语言按**中文原串**在 L10N[lang] 里查表，查不到才回落英文。",
  "    //   ⇒ 守卫断言只判「字典覆盖率」，不再锁「源码里 zh/en 三元各有多少处」。",
  "    var LOCALE_ALL = ['zh', 'en', 'ja']",
  "    /** 系统语言归一：'ja-JP'→'ja'、'zh_CN'→'zh'、'en-US'→'en'；未知 ⇒ ''。 */",
  "    function normLocale(v) {",
  "      var s = String(v == null ? '' : v).toLowerCase()",
  "      if (!s) return ''",
  "      for (var i = 0; i < LOCALE_ALL.length; i++) {",
  "        if (s === LOCALE_ALL[i] || s.indexOf(LOCALE_ALL[i] + '-') === 0 || s.indexOf(LOCALE_ALL[i] + '_') === 0) return LOCALE_ALL[i]",
  "      }",
  "      return ''",
  "    }",
  "    /**",
  "     * 内联两参文案 L(中文, English)。",
  "     *   · locale='zh' ⇒ 中文原样",
  "     *   · 其它语言 ⇒ 先查 L10N[locale][中文]（第三语言档），缺失才回落 English",
  "     * 新增语言：往 L10N 加一份 { '<中文原串>': '<译文>' }，本函数与所有调用点都不动。",
  "     */",
  "    function L(a, b) {",
  "      if (locale === 'zh') return a",
  "      var m = L10N[locale]",
  "      if (m) { var v = m[a]; if (v !== undefined && v !== null && v !== '') return v }",
  "      return b === undefined ? a : b",
  "    }",
  "    /** 显式第三参逃生口 L3(中文, English, 日语)：仅当日语档缺该项时用。 */",
  "    function L3(a, b, ja) {",
  "      if (locale === 'zh') return a",
  "      if (locale === 'ja' && ja !== undefined && ja !== null) return ja",
  "      return L(a, b)",
  "    }",
]
lines.splice(idxA, 0, ...INFRA)

// ── 锚点 B：I18N 字典结尾 `    }` 之后插入 L10N + I18N.ja ──
// 形态： `      }` / `    }` / `    var locale = 'zh'`（现已多出 INFRA，故重新定位）
const idxLocale = lines.findIndex((l) => l === ANCHOR_A)
if (idxLocale < 0) throw new Error('锚点 B: var locale 未找到')
const idxDictEnd = (() => {
  for (let i = idxLocale - 1; i >= 0; i--) if (lines[i] === '    }') return i
  throw new Error('锚点 B: I18N 结尾未找到')
})()

const dump = (obj) => JSON.stringify(obj).replace(/\\"/g, '\\"')
const DATA = [
  "    // ───────────────── 多语言字典（数据档，非逻辑） ─────────────────",
  "    // ★I18N.ja：来自 PR #143（humou44）的 561 条日语译文，按「键」对齐；缺失键回落 I18N.zh。",
  "    //   PR 基线是 main@v3.1.7，本树领先 166 提交 ⇒ 新增 UI（皮肤中心 / 团队页）的键另行补齐。",
  "    I18N.ja = " + JSON.stringify(dictJa, null, 2).split('\n').join(eol),
  "    // ★L10N.ja：内联文案表，键 = **中文原串**（与源码 L(中文, English) 的第一参逐字对应）。",
  "    //   新增语言时在此加一份即可，源码里 700+ 个调用点一行都不用改。",
  "    var L10N = { ja: " + JSON.stringify(inlineJa, null, 2).split('\n').join(eol) + ' }',
]
lines.splice(idxDictEnd + 1, 0, ...DATA)

let out = lines.join(eol)

// ── 锚点 C：applyLocalePref 接受 ja + 归一化 ──
const oldApply = [
  "    function applyLocalePref(m) {",
  "      if (m !== 'zh' && m !== 'en' && m !== 'system') m = 'system'",
  "      localeMode = m",
  "      var target = m === 'system' ? sysLocale : m",
  "      if (locale !== target) { locale = target; localeListeners.forEach(function (fn) { try { fn() } catch (e) {} }) }",
  "    }",
].join(eol)
const newApply = [
  "    function applyLocalePref(m) {",
  "      // 归一化：'ja-JP' → 'ja'；未知语言回落 'system'（跟随 DSH 系统语言）",
  "      var nm = normLocale(m)",
  "      if (m !== 'system' && !nm) m = 'system'",
  "      else if (m !== 'system') m = nm",
  "      localeMode = m",
  "      var raw2 = m === 'system' ? sysLocale : m",
  "      var target = normLocale(raw2) || 'en'",
  "      if (locale !== target) { locale = target; localeListeners.forEach(function (fn) { try { fn() } catch (e) {} }) }",
  "    }",
].join(eol)
if (out.split(oldApply).length - 1 !== 1) throw new Error('锚点 C(applyLocalePref) 命中数 != 1')
out = out.replace(oldApply, newApply)

// ── 锚点 D：setLocale 接受 ja ──
const oldSet = "    function setLocale(l) { if (l !== 'zh' && l !== 'en') return; if (l === locale) return; locale = l; localeListeners.forEach(function (fn) { try { fn(l) } catch (e) {} }) }"
const newSet = "    function setLocale(l) { var nm = normLocale(l); if (!nm) return; if (nm === locale) return; locale = nm; localeListeners.forEach(function (fn) { try { fn(nm) } catch (e) {} }) }"
if (out.split(oldSet).length - 1 !== 1) throw new Error('锚点 D(setLocale) 命中数 != 1')
out = out.replace(oldSet, newSet)

// ── 锚点 E：语言下拉列表 ──
const oldList = "    var LOCALE_IDS_LIST = ['system', 'zh', 'en']"
const newList = "    var LOCALE_IDS_LIST = ['system'].concat(LOCALE_ALL)"
if (out.split(oldList).length - 1 !== 1) throw new Error('锚点 E(LOCALE_IDS_LIST) 命中数 != 1')
out = out.replace(oldList, newList)

// ── 锚点 F：系统语言跟随（原来只认 zh/en 两档） ──
const oldFollow = "            if (localeMode !== 'zh' && localeMode !== 'en') { locale = sysLocale; emit() }"
const newFollow = "            if (localeMode === 'system') { locale = normLocale(sysLocale) || locale; emit() }"
if (out.split(oldFollow).length - 1 !== 1) throw new Error('锚点 F(跟随) 命中数 != 1')
out = out.replace(oldFollow, newFollow)

// ── 锚点 G：sysLocale 初值也要归一 ──
const oldSys0 = "        if (sl0 && sl0.active) sysLocale = sl0.active"
const newSys0 = "        if (sl0 && sl0.active) sysLocale = normLocale(sl0.active) || sysLocale"
if (out.split(oldSys0).length - 1 !== 1) throw new Error('锚点 G(sysLocale 初值) 命中数 != 1')
out = out.replace(oldSys0, newSys0)

const oldSys1 = "          if (snap && snap.active && snap.active !== sysLocale) {"
const newSys1 = "          if (snap && snap.active && normLocale(snap.active) && normLocale(snap.active) !== sysLocale) {"
if (out.split(oldSys1).length - 1 !== 1) throw new Error('锚点 G2(sysLocale 变更) 命中数 != 1')
out = out.replace(oldSys1, newSys1)

const oldSys2 = "            sysLocale = snap.active"
if (out.split(oldSys2).length - 1 !== 1) throw new Error('锚点 G3(sysLocale 赋值) 命中数 != 1')
out = out.replace(oldSys2, "            sysLocale = normLocale(snap.active)")

// 完整性断言
if (!out.includes('function L(a, b) {') || !out.includes('var L10N = { ja:')) throw new Error('插入后断言失败')
const eol2 = (out.match(/\r\n/g) || []).length
writeFileSync(FILE, out)
console.log('[patch1] OK')
console.log('  字符数:', raw.length, '->', out.length, '(+' + (out.length - raw.length) + ')')
console.log('  CRLF:', (raw.match(/\r\n/g) || []).length, '->', eol2, ' 裸LF:', (out.match(/(?<!\r)\n/g) || []).length)
console.log('  I18N.ja 键:', Object.keys(dictJa).length, ' L10N.ja 项:', Object.keys(inlineJa).length)
