/**
 * 同步桩片段到已插入的套件（补齐 locale 缺省），并补上 r38（变量名为 ctx）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = 'D:/dsh-auto-memory/tests/smoke'
const SNIP = readFileSync('D:/dsh-auto-memory/tools/i18n/stub-snippet.txt', 'utf8').trimEnd()
const MARK = '__mkI18nStub'
const log = []

const FILES = [
  'smoke-test-r18-fe02-screens.mjs',
  'smoke-test-r19-fe02-screens2.mjs',
  'smoke-test-r23-skin-center.mjs',
  'smoke-test-r27-timeline-card.mjs',
  'smoke-test-r38-foldopen-white-screen.mjs',
  'smoke-test-r40-rail-drives-main.mjs',
  'smoke-test-r41-tag-and-lane-colors.mjs',
]

for (const f of FILES) {
  const p = path.join(DIR, f)
  let src = readFileSync(p, 'utf8')
  const before = src
  // 用新版片段替换旧版（旧版无 locale 缺省）
  const re = new RegExp('function __mkI18nStub\\(self\\) \\{[\\s\\S]*?\\n\\}\\n', 'm')
  if (re.test(src)) {
    src = src.replace(re, SNIP + '\n')
    log.push(`  ${f}: 片段已同步为新版`)
  } else {
    log.push(`  ${f}: 未找到片段（跳过）`)
  }
  // r38：变量名 ctx
  if (f.includes('r38')) {
    if (!src.includes(`${MARK}(ctx)`)) {
      const anchor = 'vm.createContext(ctx);'
      const n = src.split(anchor).length - 1
      if (n === 1) {
        src = src.replace(anchor, `${MARK}(ctx);\n  ` + anchor)
        log.push(`  ${f}: ctx 注入 ✓`)
      } else {
        log.push(`  ${f}: ctx 锚点命中 ${n} 次，需人工处理`)
      }
    } else log.push(`  ${f}: ctx 已注入`)
  }
  if (src !== before) writeFileSync(p, src)
}
console.log(log.join('\n'))
