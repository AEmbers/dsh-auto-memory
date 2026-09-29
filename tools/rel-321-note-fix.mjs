/**
 * 3.2.1 收尾：把「一键接续漂移」修复补进**应用内更新说明** + 同步指纹行。
 * 版本号不变（用户口径：沿用 3.2.1），只补条目 + 换指纹标识。
 * 锚点用 3.2.1 独有的文案行（`], en: [` 在每个版本里都有，不可用）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const CJ = 'D:/dsh-auto-memory/lib/client.js'
const ok = (c, m) => { if (!c) throw new Error('断言失败: ' + m) }
const N = (s, sub) => s.split(sub).length - 1

let cj = readFileSync(CJ, 'utf8')
const crlf0 = (cj.match(/\r\n/g) || []).length
const lf0 = (cj.match(/\n/g) || []).length
ok(lf0 === crlf0, 'client.js 原本不是纯 CRLF')

const IND = '        '
const zhFix = IND + "'★ 修复:手动点「一键接续」会把新会话建到**别的工作区** —— 现在按本次会话取交接材料并严格校核,拿不到明确目标时如实提示,不再跨工作区猜。自动接续行为不变。',\r\n"
const enFix = IND + "'★ Fix: one-click continue could create the new session in the **wrong workspace** — it now resolves the handoff source from the current session, cross-checks it, and reports honestly instead of guessing across workspaces. Auto-continue is unchanged.',\r\n"

// ── 1. zh：锚 3.2.1 独有文案行（用于前置插入）──
const ZH_A = IND + "'★ 新增:界面语言增加**"
ok(N(cj, ZH_A) === 1, 'zh 锚点命中 ' + N(cj, ZH_A) + ' 次（期望 1）')
cj = cj.replace(ZH_A, zhFix + ZH_A)

// ── 2. en：锚 3.2.1 独有文案行 ──
const EN_A = IND + "'★ New: the UI language set now includes **Japanese**"
ok(N(cj, EN_A) === 1, 'en 锚点命中 ' + N(cj, EN_A) + ' 次（期望 1）')
cj = cj.replace(EN_A, enFix + EN_A)

// ── 3. 指纹行 ──
const FP_OLD = 'fingerprint: i18n-ja'
ok(N(cj, FP_OLD) === 1, '指纹行锚点命中 ' + N(cj, FP_OLD) + ' 次（期望 1）')
cj = cj.replace(FP_OLD, 'fingerprint: i18n-ja-and-continue-workspace-fix')

// ── 4. 守恒与幂等自检 ──
const crlf1 = (cj.match(/\r\n/g) || []).length
const lf1 = (cj.match(/\n/g) || []).length
ok(lf1 === crlf1, '写入后出现裸 LF: ' + (lf1 - crlf1))
ok(crlf1 - crlf0 === 2, 'CRLF 增量应为 2，实为 ' + (crlf1 - crlf0))
ok(N(cj, '一键接续」会把新会话建到') === 1, 'zh 修复条目不是恰好 1 条')
ok(N(cj, 'one-click continue could create') === 1, 'en 修复条目不是恰好 1 条')
ok(cj.includes('fingerprint: i18n-ja-and-continue-workspace-fix'), '指纹行未更新')
// 位置正确性：修复条目必须落在 3.2.1 段内（在 '3.2.1' 之后、'3.2.0' 之前）
const p321 = cj.indexOf("'3.2.1': { zh: [")
const p320 = cj.indexOf("'3.2.0': { zh: [")
const pFix = cj.indexOf('一键接续」会把新会话建到')
ok(p321 > 0 && p321 < pFix && pFix < p320, '修复条目未落在 3.2.1 段内')
// 顺序：修复条目应在日文条目之前
ok(pFix < cj.indexOf(ZH_A), '修复条目未排在日文条目之前')

writeFileSync(CJ, cj)
console.log('client.js 应用内条目 + 指纹行 已更新')
console.log('CRLF ' + crlf0 + ' -> ' + crlf1 + ' (+' + (crlf1 - crlf0) + ') / 裸LF 0')
