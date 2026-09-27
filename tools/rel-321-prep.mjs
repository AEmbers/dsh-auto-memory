/**
 * 3.2.1 版本标识三处落地（CHANGELOG.md / 应用内更新说明 / 界面指纹行）
 *
 * 用户口径：本版更新量小 ⇒ **沿用 3.2.0 的更新日志**，在其基础上增加
 *          「增加日文支持，后面预计增加更多语言支持」。
 *
 * ★不重复原则（工程判据）：
 *   - CHANGELOG.md：`[3.2.1]` 段写明「其余内容 = [3.2.0] 逐字沿用」并指向该节，
 *     不把 174 行正文抄两遍（抄两遍会被读成事故）。
 *   - 应用内更新说明：`'3.2.1'` 只列**本次新增**。原因：升级弹窗按版本区间
 *     **聚合**（`Object.keys(CHANGELOG).filter(v > fromVer && v <= toVer)`），
 *     3.1.x 用户升级时会自动带上 `'3.2.0'` 段 ⇒ 若 3.2.1 再抄一遍，用户会看两遍。
 *
 * 断言：三处标识各自复核；client.js CRLF 不变、裸 LF 0。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const VER = '3.2.1'
const DATE = '2026-09-28'
const CL = 'D:/dsh-auto-memory/CHANGELOG.md'
const CJ = 'D:/dsh-auto-memory/lib/client.js'

const ok = (c, m) => { if (!c) throw new Error('断言失败: ' + m) }

// ══════════════════════════════════════════════════════════
// 1. CHANGELOG.md
// ══════════════════════════════════════════════════════════
let cl = readFileSync(CL, 'utf8')
const eol = cl.includes('\r\n') ? '\r\n' : '\n'
console.log('CHANGELOG EOL =', eol === '\r\n' ? 'CRLF' : 'LF')

const head320 = cl.indexOf('## [3.2.0]')
ok(head320 > 0, 'CHANGELOG 里找不到 `## [3.2.0]`')
ok(cl.indexOf('## [3.2.0]', head320 + 1) < 0, '`## [3.2.0]` 出现多于一次')
ok(cl.indexOf('## [' + VER + ']') < 0, 'CHANGELOG 里已存在 ' + VER + ' 小节')

const sec = [
  '## [' + VER + '] — ' + DATE + ' · 日文界面支持（本版内容 = 3.2.0 全部内容 + 日文界面）',
  '',
  '> **本版是 3.2.0 的增量版**：功能内容与 **3.2.0 完全一致**（逐字沿用，见下方 **[3.2.0]** 小节），另加**日文界面支持**。',
  '> 因此本版**不需要重复阅读 3.2.0 的说明** —— 已升到 3.2.0 的话，只需**刷新页面**即可看到日文界面。',
  '',
  '### ★ 本版新增：日文界面（日本語）',
  '',
  '- **界面语言增加「日本語」**：设置页「语言」下拉在「跟随系统 / 中文 / English」之外新增 **日本語**；选「跟随系统」时，系统语言为日文（如 `ja-JP`）会自动切到日文。',
  '- **覆盖范围**：记忆面板、设置页、时间线、看板、团队页、皮肤中心等**全部界面文案** —— 覆盖 **602 条内联文案 + 583 条词典条目**。',
  '- **按需回落，不会出现空白**：某条日文若缺失，会**自动回落到英文**，再回落中文 —— 不会显示成键名或空白。',
  '- **★ 架构（为后续语言铺路）**：界面文案改为**字典查表式** —— `L(中文, English)` 两参调用，第三语言在词典里按**中文原串**查表。⇒ **以后新增一门语言只需加一份词典，不需要改动任何调用点**；后续语言会按同一方式接入。',
  '- **刻意不译的部分**：**模型侧提示词模板**保持中文原样（它们面向模型而非用户，改动会改变模型行为）。',
  '- **中文 / English 行为不变**：既有两种语言的显示与默认值一字未动。',
  '',
  '### 本版其余内容',
  '',
  '与 **[3.2.0]** 小节**完全一致、逐字沿用**（皮肤选择中心与皮肤库 / 团队协作线 / 归档删除自持 / 工作台轮换门 / 归档保护面 / 白板看板读感 / CI 门禁），此处不再抄写一遍。',
  '',
  '---',
  '',
].join(eol)

cl = cl.slice(0, head320) + sec + cl.slice(head320)
ok(cl.includes('## [' + VER + ']'), 'CHANGELOG 未出现 ' + VER + ' 小节')
ok(cl.includes('## [3.2.0]'), 'CHANGELOG 丢了 3.2.0 小节')
ok(cl.split('## [3.2.0]').length - 1 === 1, '3.2.0 小节数量变了')
writeFileSync(CL, cl)
console.log('CHANGELOG.md: 已插入 [' + VER + '] 小节（指向 [3.2.0] 逐字沿用，不重复正文）')

// ══════════════════════════════════════════════════════════
// 2. client.js —— 应用内更新说明 + 指纹行
// ══════════════════════════════════════════════════════════
let cj = readFileSync(CJ, 'utf8')
const crlf0 = (cj.match(/\r\n/g) || []).length
const lf0 = (cj.match(/\n/g) || []).length
ok(lf0 === crlf0, 'client.js 原本就不是纯 CRLF')

const ANCH = 'var CHANGELOG = {\r\n'
ok(cj.split(ANCH).length - 1 === 1, '`var CHANGELOG = {` 锚点不是恰 1 次')
ok(cj.indexOf("'" + VER + "': { zh: [") < 0, '应用内字典已存在 ' + VER)

const zhJa = [
  '★ 新增:界面语言增加**日文（日本語）** —— 设置页「语言」下拉新增「日本語」;选「跟随系统」时,系统语言为日文(如 ja-JP)会自动切换。',
  '★ 为后续语言铺路:界面文案改为**字典查表式** —— 以后新增一门语言只需加一份词典,不需要改动任何调用点;后续语言会按同一方式接入。',
  '覆盖记忆面板、设置页、时间线、看板、团队页、皮肤中心等**全部界面文案**;某条日文缺失时会**自动回落到英文**,不会显示成空白或键名。',
  '**模型侧提示词模板保持中文**,不随界面语言变化(它们面向模型,不是界面)。',
  '本版为前端改动,刷新页面即可看到「日本語」;中文 / English 的显示与默认值一字未动。',
  '本版功能内容与 3.2.0 一致(皮肤中心 / 团队协作线 / 归档删除自持 / 工作台轮换门),不再重复列出。',
]
const enJa = [
  '★ New: the UI language set now includes **Japanese** — Settings → Language gains 日本語, and "Follow system" switches to it automatically when your system language is Japanese (e.g. ja-JP).',
  '★ Built for what comes next: UI strings now go through a **dictionary lookup** — adding another language later means adding one dictionary file, with no call-site changes; later languages will plug in the same way.',
  'Covers the memory panel, settings, timeline, kanban board, team page and skin center — every UI string. If a Japanese entry is missing it **falls back to English** rather than showing a blank or a raw key.',
  '**Model-side prompt templates stay Chinese** by design — they are written for the model, not for the UI.',
  'Frontend-only change: refresh the page to get 日本語. Chinese / English rendering and defaults are untouched.',
  'Feature content matches 3.2.0 (skin center / team collaboration / self-owned archive+delete / workbench rotation) and is not repeated here.',
]

const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "',"
const entry = [
  "  '" + VER + "': { zh: [",
  ...zhJa.map((s) => '        ' + q(s)),
  '      ], en: [',
  ...enJa.map((s) => '        ' + q(s)),
  '      ] },\r\n',
].join('\r\n')

cj = cj.replace(ANCH, ANCH + entry)

const fpOld = 'client v3.2.0 fingerprint: skin-center-and-team-collab'
ok(cj.split(fpOld).length - 1 === 1, '指纹行锚点不是恰 1 次')
cj = cj.replace(fpOld, 'client v' + VER + ' fingerprint: i18n-ja')

const crlf1 = (cj.match(/\r\n/g) || []).length
const lf1 = (cj.match(/\n/g) || []).length
ok(lf1 === crlf1, '写入后出现裸 LF: ' + (lf1 - crlf1))
ok(cj.includes("'" + VER + "': { zh: ["), '应用内字典缺 ' + VER + ' 条目')
ok(cj.includes('client v' + VER + ' fingerprint'), '指纹行未更新')
ok(cj.includes("'3.2.0': { zh: ["), '3.2.0 应用内条目被破坏')
writeFileSync(CJ, cj)
console.log('client.js: 应用内字典 + 指纹行已更新')
console.log('CRLF ' + crlf0 + ' -> ' + crlf1 + ' / 裸LF ' + (lf1 - crlf1))
