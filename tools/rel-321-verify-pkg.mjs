/**
 * 发布包内容复核（只读）：确认「一键接续漂移」修复真的进了 REL 树。
 * 不用内联 node -e（PowerShell 会吃掉引号与输出）。
 */
import { readFileSync } from 'node:fs'

const R = 'D:/dsh_debug/_publish_dsh-auto-memory/'
const ix = readFileSync(R + 'lib/index.js', 'utf8')
const cj = readFileSync(R + 'lib/client.js', 'utf8')
const cl = readFileSync(R + 'CHANGELOG.md', 'utf8')
const pkg = JSON.parse(readFileSync(R + 'package.json', 'utf8'))

const has = (s, sub) => s.includes(sub)
const rows = [
  ['宿主·不再跨工作区回退', has(ix, 'String(sessionId || "") || this.currentSessionId()')],
  ['宿主·旧回退调用已移除', !has(ix, 'this.currentSessionId() || this.recentSessionIdFallback()')],
  ['前端·严格校核 rfSid===selfSid', has(cj, 'rfSid === selfSid')],
  ['前端·刷新仪式带 selfSid', has(cj, 'selfSid ? { sessionId: selfSid } : {}')],
  ['前端·优先序已翻转', has(cj, 'String(currentSessionIdClient() || lastRefreshSessionId || ')],
  ['指纹行已更新', has(cj, 'fingerprint: i18n-ja-and-continue-workspace-fix')],
  ['应用内·zh 修复条目', has(cj, '一键接续」会把新会话建到')],
  ['应用内·en 修复条目', has(cj, 'one-click continue could create')],
  ['CHANGELOG·修复小节', has(cl, '一键接续」把新会话建到别的工作区')],
  ['CHANGELOG·含 3.2.1 标题', has(cl, '## [3.2.1]')],
  ['package.json 版本 = 3.2.1', pkg.version === '3.2.1'],
  ['日文支持仍在（I18N.ja）', has(cj, 'I18N') && has(cj, "'ja'")],
]
let bad = 0
for (const [k, v] of rows) { if (!v) bad++; console.log((v ? '  OK  ' : '  ✗   ') + k) }
console.log('')
console.log('sha16 index.js :', (await import('node:crypto')).createHash('sha256').update(readFileSync(R + 'lib/index.js')).digest('hex').slice(0, 16).toUpperCase())
console.log('sha16 client.js:', (await import('node:crypto')).createHash('sha256').update(readFileSync(R + 'lib/client.js')).digest('hex').slice(0, 16).toUpperCase())
console.log(bad === 0 ? '结论：发布包内容复核全部通过' : '结论：有 ' + bad + ' 项未通过')
if (bad) process.exit(1)
