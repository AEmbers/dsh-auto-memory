/**
 * 感谢 PR #143 贡献者 @humou44：README 双语致谢段 + 贡献者页卡片 + 计数 19→20。
 *
 * 事实依据（可复算）：refs/tmp/pr143 提交作者 = humou44；PR #143 = Aik358/dsh-auto-memory
 *   （日语 i18n，closed 但内容已并入主线并扩展为字典查表式，见 CHANGELOG [3.2.1]）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = 'D:/dsh-auto-memory/'
const USER = 'humou44'
const PR = '143'
const ok = (c, m) => { if (!c) throw new Error('断言失败: ' + m) }
const EOL = (s) => (s.includes('\r\n') ? '\r\n' : '\n')

const results = []

// ══════════════════════════════════════════════════════════
// 1. README.md（英文） / README.zh-CN.md（中文）
// ══════════════════════════════════════════════════════════
const readmeJobs = [
  {
    file: 'README.md',
    anchor: '- [@fei009009](https://github.com/fei009009) — pull request ([#29](https://github.com/Aik358/dsh-auto-memory/pull/29))\n',
    line:
      '- [@' + USER + '](https://github.com/' + USER + ') — Japanese UI localisation: proposed in [PR #' + PR + '](https://github.com/Aik358/dsh-auto-memory/pull/' + PR + ') and landed as a dictionary-driven i18n layer covering the whole panel (602 inline strings + 583 dictionary keys); more languages will plug into the same layer\n',
  },
  {
    file: 'README.zh-CN.md',
    anchor: '- [@fei009009](https://github.com/fei009009) — 提交 PR（[#29](https://github.com/Aik358/dsh-auto-memory/pull/29)）\n',
    line:
      '- [@' + USER + '](https://github.com/' + USER + ') — 日文界面本地化：[PR #' + PR + '](https://github.com/Aik358/dsh-auto-memory/pull/' + PR + ') 提出，已并入主线并扩展为**字典查表式** i18n 层，覆盖整个面板（602 条内联文案 + 583 条词典条目）；后续语言沿用同一层接入\n',
  },
]

for (const j of readmeJobs) {
  const p = ROOT + j.file
  let s = readFileSync(p, 'utf8')
  const e = EOL(s)
  ok(!s.includes('@' + USER), j.file + ' 已存在 @' + USER)
  const a = j.anchor.replace(/\n$/, e)
  const n = s.split(a).length - 1
  ok(n === 1, j.file + ' 锚点命中 ' + n + ' 次（期望 1）')
  s = s.replace(a, a + j.line.replace(/\n$/, e))
  ok(s.includes('@' + USER), j.file + ' 未写入')
  writeFileSync(p, s)
  results.push(j.file + ': 已加入 @' + USER)
}

// ══════════════════════════════════════════════════════════
// 2. docs/CONTRIBUTORS.html —— 卡片 + 计数
// ══════════════════════════════════════════════════════════
{
  const p = ROOT + 'docs/CONTRIBUTORS.html'
  let s = readFileSync(p, 'utf8')
  const e = EOL(s)
  ok(!s.includes('@' + USER), 'CONTRIBUTORS.html 已存在 @' + USER)

  // 2a. 插在 @fei009009 卡片之后
  const anchor = '        <a href="https://github.com/fei009009" target="_blank" rel="noopener">@fei009009</a>' + e
  const n = s.split(anchor).length - 1
  ok(n === 1, 'CONTRIBUTORS.html 锚点命中 ' + n + ' 次（期望 1）')

  // 找到该卡片所在 <div class="card"> 的结束位置：从锚点起，第一个 "\n    </div>" 之后
  const anchorIdx = s.indexOf(anchor)
  const cardEndMark = e + '    </div>' + e
  const cardEnd = s.indexOf(cardEndMark, anchorIdx)
  ok(cardEnd > anchorIdx, '找不到 fei009009 卡片的收尾 </div>')
  const insertAt = cardEnd + cardEndMark.length

  const card = [
    '    <div class="card">',
    '      <div class="top">',
    '        <img src="https://github.com/' + USER + '.png?size=92" alt="' + USER + '" loading="lazy">',
    '        <div class="who">',
    '          <a href="https://github.com/' + USER + '" target="_blank" rel="noopener">@' + USER + '</a>',
    '          <div class="tier"><span class="zh">1 PR（日文本地化）</span><span class="en">1 PR (Japanese localisation)</span></div>',
    '        </div>',
    '      </div>',
    '      <p class="desc zh">提出日文界面本地化（[PR #' + PR + ']）。该 PR 虽被关闭，但内容已并入主线：在其基础上扩展为<b>字典查表式</b> i18n 层 —— 界面文案改用 <code>L(中文, English)</code> 两参调用、第三语言按中文原串查词典，覆盖 602 条内联文案 + 583 条词典条目。此后新增语言只需加一份词典，无需改动任何调用点。</p>',
    '      <p class="desc en">Proposed Japanese UI localisation ([PR #' + PR + ']). The PR was closed, but its content landed in main and was extended into a <b>dictionary-driven</b> i18n layer — UI strings use <code>L(Chinese, English)</code> with the third language resolved from a Chinese-keyed dictionary, covering 602 inline strings + 583 dictionary keys. Adding a language now means adding one dictionary, with no call-site changes.</p>',
    '      <div class="refs">',
    '        <a href="https://github.com/Aik358/dsh-auto-memory/pull/' + PR + '">PR #' + PR + '</a>',
    '      </div>',
    '    </div>',
    '',
  ].join(e)

  s = s.slice(0, insertAt) + card + s.slice(insertAt)

  // 2b. 计数 19 → 20（只改 data-reel 与文本）
  const statOld = '<div class="stat"><b id="s-ppl" data-reel="19">19</b>'
  ok(s.split(statOld).length - 1 === 1, '计数锚点不是恰 1 次')
  s = s.replace(statOld, '<div class="stat"><b id="s-ppl" data-reel="20">20</b>')

  ok(s.includes('@' + USER), 'CONTRIBUTORS.html 未写入卡片')
  ok(s.includes('data-reel="20">20</b>'), '计数未更新')
  writeFileSync(p, s)
  results.push('docs/CONTRIBUTORS.html: 已加入卡片 + 计数 19→20')
}

console.log(results.join('\n'))
console.log('EOL 保持：README.md / README.zh-CN.md / CONTRIBUTORS.html 各自原样')
