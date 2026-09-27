/**
 * 适配剩余失败套件（精确锚点 + 命中断言；不做启发式猜测）
 *
 * 类型 A：4 条静态断言锁死旧源码形态 ⇒ 放宽为**形态无关**（同时接受三元与 L()）
 * 类型 B：8 个 vm 沙箱缺 L/L3/normLocale 桩 ⇒ 注入
 *
 * 每条改动都断言「锚点恰命中 1 次」，不符合即抛错、不落盘。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = 'D:/dsh-auto-memory/tests/smoke'
const log = []

function applyEdits(file, edits) {
  const p = path.join(DIR, file)
  let out = readFileSync(p, 'utf8')
  const before = out
  for (const ed of edits) {
    if (ed.skip && ed.skip(out)) { log.push(`  ${file} :: ${ed.name} (已符合)`); continue }
    const n = out.split(ed.old).length - 1
    if (n !== 1) throw new Error(`${file} :: ${ed.name} 锚点命中 ${n} 次（期望 1）\n---\n${ed.old.slice(0, 200)}\n---`)
    out = out.replace(ed.old, ed.new)
    log.push(`  ${file} :: ${ed.name} ✓`)
  }
  if (out !== before) writeFileSync(p, out)
  return out
}

// ── 类型 A：静态断言放宽 ──────────────────────────────────────────
applyEdits('smoke-test-panel-position.mjs', [{
  name: '页签 label 断言形态无关',
  old: `ok(/label: function \\(\\) \\{ return locale === 'zh' \\? '记忆' : 'Memory' \\}/.test(SRC), '页签标签中英双语')`,
  new: `// ★2026-09-28 放宽：内联文案已由 \`locale === 'zh' ? 甲 : 乙\` 统一改为 \`L(甲, 乙)\`，
  //   断言改为**形态无关**（两种写法都接受），以后再加语言无需再改本断言。
  ok(/(label: function \\(\\) \\{ return (?:locale === 'zh' \\? '记忆' : 'Memory'|L\\('记忆', 'Memory'\\))) \\}/.test(SRC), '页签标签中英双语（形态无关）')`,
}])

applyEdits('smoke-test-issue30-procedure-promotion.mjs', [{
  name: '观察标记断言形态无关',
  old: `ok(/observationOnly \\? \\(locale === 'zh' \\? ' · 观察/.test(CLIENT_SRC), 'client.js 审批队列为观察型条目打标')`,
  new: `// ★2026-09-28 放宽为形态无关（三元 / L() 两种写法都接受）。
  ok(/observationOnly \\? \\((?:locale === 'zh' \\? ' · 观察|L\\(' · 观察)/.test(CLIENT_SRC), 'client.js 审批队列为观察型条目打标（形态无关）')`,
}])

applyEdits('smoke-test-l3-team.mjs', [{
  name: '§8.4 sectionLabels.team 断言形态无关',
  old: `ok(/team: locale === 'zh' \\? '团队协作' : 'Teamwork'/.test(SRC), '§8.4 sectionLabels.team 双语')`,
  new: `// ★2026-09-28 放宽为形态无关（三元 / L() 两种写法都接受）。
  ok(/team: (?:locale === 'zh' \\? '团队协作' : 'Teamwork'|L\\('团队协作', 'Teamwork'\\))/.test(SRC), '§8.4 sectionLabels.team 双语（形态无关）')`,
}])

applyEdits('smoke-test-graph-mode.mjs', [{
  name: 'conversation.view label 断言形态无关',
  old: `assert(/label:\\s*function\\s*\\(\\)\\s*\\{\\s*return\\s+locale\\s*===\\s*'zh'/.test(CLI_SRC), 'label 必须是 locale 跟随函数(否则显示 undefined/切语言不重算)')`,
  new: `// ★2026-09-28 放宽为形态无关：label 仍必须是**跟随语言的函数**（这是原意，未变），
  //   但函数体可以是三元或 L()（内联文案已统一走 L）。
  assert(/label:\\s*function\\s*\\(\\)\\s*\\{\\s*return\\s+(?:locale\\s*===\\s*'zh'|L\\()/.test(CLI_SRC), 'label 必须是 locale 跟随函数（形态无关；否则显示 undefined/切语言不重算）')`,
}])

console.log(log.join('\n'))
console.log('类型 A 完成')
