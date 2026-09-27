/**
 * 给剩余 8 个 vm 抽段套件的沙箱注入 L/L3/normLocale 桩。
 *
 * 桩以「内联函数 + 立即调用」形式注入到沙箱**构造完成之后**（避免 TDZ），
 * 片段来自 tools/i18n/stub-snippet.txt（外置，避免本脚本内的多层转义）。
 *
 * 锚点：定位到每个套件的 `vm.createContext(<var>)` 调用，在其**前一行**插入注入。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = 'D:/dsh-auto-memory/tests/smoke'
const SNIP = readFileSync('D:/dsh-auto-memory/tools/i18n/stub-snippet.txt', 'utf8').trimEnd()
const MARK = '__mkI18nStub'

// 套件 → 沙箱变量名（从各自源码读出的确切名字）
const TARGETS = [
  ['smoke-test-r18-fe02-screens.mjs', 'sb'],
  ['smoke-test-r19-fe02-screens2.mjs', 'sb'],
  ['smoke-test-r23-skin-center.mjs', 'sandbox'],
  ['smoke-test-r27-timeline-card.mjs', 'sb'],
  ['smoke-test-r38-foldopen-white-screen.mjs', 'c'],
  ['smoke-test-r40-rail-drives-main.mjs', 'c'],
  ['smoke-test-r40-rail-drives-main.mjs', 'c2'],
  ['smoke-test-r41-tag-and-lane-colors.mjs', 'c'],
  ['smoke-test-r41-tag-and-lane-colors.mjs', 'c2'],
]

const log = []
const byFile = new Map()
for (const [f, v] of TARGETS) {
  if (!byFile.has(f)) byFile.set(f, [])
  byFile.get(f).push(v)
}

const SNIP_ONCE = SNIP + '\n'

for (const [file, vars] of byFile) {
  const p = path.join(DIR, file)
  let src = readFileSync(p, 'utf8')
  const before = src
  // 把片段函数插到文件顶部（import 之后），只插一次
  if (!src.includes(MARK)) {
    const lines = src.split('\n')
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\s/.test(lines[i])) idx = i + 1
    }
    lines.splice(idx, 0, '', '// ★2026-09-28 多语言化：源码内联文案已改为 L(甲, 乙)。抽段进 vm 的套件需要同名桩。', SNIP_ONCE)
    src = lines.join('\n')
    log.push(`  ${file}: 片段已插入`)
  } else {
    log.push(`  ${file}: 片段已存在`)
  }
  for (const v of vars) {
    const anchor = `vm.createContext(${v})`
    const n = src.split(anchor).length - 1
    if (n === 0) {
      // 另一种形态：createContext 在同一行被内联调用
      const alt = `vm.createContext(${v}, `
      const n2 = src.split(alt).length - 1
      log.push(`  ${file} :: ${v} —— createContext 形态未匹配（n=${n}, alt=${n2}），需人工核对`)
      continue
    }
    const inject = `${MARK}(${v})\n`
    if (src.includes(inject)) { log.push(`  ${file} :: ${v} 已注入`); continue }
    src = src.replace(anchor, inject + anchor)
    log.push(`  ${file} :: ${v} 注入 ✓`)
  }
  if (src !== before) writeFileSync(p, src)
}

console.log(log.join('\n'))
