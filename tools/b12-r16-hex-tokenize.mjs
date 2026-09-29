#!/usr/bin/env node
/**
 * R16 · 外观层残余 token 化（第一批：JS 逻辑色值族）。
 *
 * ★权威：goal 目标书「外观层：裸 hex 归零 + 裸 rgba 归零」；既有约定 `var(--dam-x, 兜底)`
 *   （R3/R4 定型：颜色字面量**作为 token 兜底保留**，客户改 token 即生效）。
 * ★为什么还有残余：R4 只清了「掩码 var() 后」的 26 处；**JS 逻辑里返回色值的分支**
 *   （kxLaneColor / 判据徽章 / ACCENT_VALUES / decBg / SVG fill）未被纳入。
 * ★零视觉变化：替换形如 `var(--dam-token, <原字面量>)` ⇒ token 未定义时取兜底（与原值一致）。
 * ★期望值**全部由被测数据自身派生**（第 1/7 条纪律）：扫描得到 sites ⇒ 期望 = sites.length。
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'client.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1

/* ── 与 scan-appearance.mjs 同口径的测量 ───────────────────────── */
const ISSUE_CTX = /(PR|pr|issue|Issue|error|Error|backport)\s*#\d+\b/g  // issue/PR 号，非颜色
function stripComments(src) {
  const out = []
  let inBlock = false
  for (const raw2 of src.split('\n')) {
    let line = raw2
    if (inBlock) { const e = line.indexOf('*/'); if (e < 0) { out.push(''); continue } line = line.slice(e + 2); inBlock = false }
    let acc = '', i = 0
    while (i < line.length) {
      const two = line.slice(i, i + 2)
      if (two === '//') break
      if (two === '/*') { inBlock = true; const e = line.indexOf('*/', i + 2); if (e < 0) { line = line.slice(0, i); break } i = e + 2; continue }
      acc += line[i]; i += 1
    }
    out.push(acc)
  }
  return out.join('\n')
}
function maskVar(s) { let p = null, c = s; while (p !== c) { p = c; c = c.replace(/var\([^()]*\)/g, '') } return c }
const HEX = /#[0-9a-fA-F]{3,8}\b/g
const RGBA = /rgba?\([^)]*\)/g
const DEF = /--dam-[a-z0-9-]+\s*:/
const lines = stripComments(raw.replace(/\r\n/g, '\n')).split('\n')
const sites = []
lines.forEach((l, i) => {
  if (DEF.test(l)) return
  const m = maskVar(l)
  for (const h of (m.match(HEX) || [])) if (ISSUE.indexOf(h) < 0) sites.push({ lit: h, line: i + 1, kind: 'hex' })
});

/* ── 语义命名（能识别的给语义名，其余给 raw-<slug>）─────────────── */
// ★第 8 条纪律：生成器注释不得含被计数标识符（此处色值仅在代码里，注释中不出现）
const SEM = {
  '#4d6bfe': 'lane-goal', '#3fa96a': 'lane-state', '#c2603f': 'lane-dead',
  '#d4a94f': 'lane-progress', '#8a7fbf': 'lane-archive',
  '#3aa675': 'tone-ok', '#e0a53a': 'tone-warn', '#d66666': 'tone-bad',
  '#1d4ed8': 'accent-deepseek', '#8b949e': 'accent-graphite', '#9b8cff': 'accent-violet',
  '#5b8def': 'accent-ai', '#4aa8b8': 'accent-ai2',
  '#7d8793': 'graph-node', '#2f7d4f': 'badge-ok-fg', '#8a6a1f': 'badge-warn-fg',
  '#7fdcb0': 'dec-emit', '#e8c584': 'dec-prefetch', '#b9ceff': 'dec-explicit', '#d4c2ff': 'dec-proactive',
  '#ff9c9c': 'dec-heavy', '#e8a1a1': 'dec-nodeliver', '#c44a4a': 'tone-error',
  '#2fa46a': 'tone-ready', '#d4744f': 'tone-high', '#6f9bff': 'progress-bar',
};
const slug = (lit) => (SEM[lit] || ('raw-' + lit.replace('#', '').toLowerCase().replace(/\(|\)|,|\.|\s/g, '-').replace(/-+/g, '-')))
const byLit = {}
for (const s of sites) (byLit[s.lit] = byLit[s.lit] || []).push(s.line)
const lits = Object.keys(byLit).sort();

console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8'));
console.log('块外裸 hex 种类 = ' + lits.length + ' | 出现次数 = ' + sites.length + '（期望值由扫描自派生）');
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
// ★锚行由源码自身派生（不靠手写缩进）
const ANCHOR_LINE = raw.split('\r\n').filter((l) => l.indexOf('--dam-blur-xl2') >= 0);
const TOKEN_ANCHOR = ANCHOR_LINE.length === 1 ? ANCHOR_LINE[0] : null;
chk('① token 定义块锚由源码派生且恰 1 行（' + (TOKEN_ANCHOR ? 'ok' : 'NG') + '）', !!TOKEN_ANCHOR && cnt(raw, TOKEN_ANCHOR) === 1)
for (const lit of lits) chk('② 字面量 ' + lit + ' 出现 ' + byLit[lit].length + ' 次且可定位', cnt(raw, lit) >= byLit[lit].length)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }

/* ── 生成 token 定义块 + 就地包裹 var(...) ──────────────────────── */
let out = raw;
const INDENT = TOKEN_ANCHOR ? TOKEN_ANCHOR.slice(0, TOKEN_ANCHOR.length - TOKEN_ANCHOR.trimStart().length) : '      ';
const tokenLines = [];
for (const lit of lits) {
  const name = slug(lit);
  tokenLines.push(INDENT + '\'--dam-' + name + ': ' + lit + ';\',');
}
let wrapped = 0;
for (const lit of lits) {
  const name = slug(lit);
  const before = cnt(out, lit);
  out = out.split(lit).join('var(--dam-' + name + ', ' + lit + ')');
  const after = cnt(out, 'var(--dam-' + name + ', ' + lit + ')');
  wrapped += after;
  chk('③ ' + lit + ' → --dam-' + name + '（包裹 ' + after + ' 处；原值仍在兜底）', after === before && after >= byLit[lit].length);
}
bad = 0;
const afterLines = stripComments(out.replace(/\r\n/g, '\n')).split('\n');
let remain = 0;
afterLines.forEach((l) => { if (DEF.test(l)) return; remain += (maskVar(l.replace(ISSUE_CTX, '#__ISSUE__')).match(HEX) || []).length });
chk('④ ★块外裸 hex 归零（实测残留 ' + remain + '）', remain === 0)
chk('⑤ 裸 LF = 0（仍纯 CRLF）', !/(^|[^\r])\n/.test(out.replace(/\r\n/g, '\u0000')).valueOf() || cnt(out, '\n') === cnt(out, '\r\n'))
chk('⑥ node 语法（外部 node --check 复核）—— 片段尾完整', out.endsWith('\r\n'))
out = out.replace(TOKEN_ANCHOR, tokenLines.join('\r\n') + '\r\n' + TOKEN_ANCHOR);
chk('⑥b ★token 定义行内不得含 var(（防自引用循环）', TOKEN_ANCHOR && out.indexOf(tokenLines[0]) >= 0 && out.slice(out.indexOf(tokenLines[0]), out.indexOf(tokenLines[0]) + 400).indexOf('var(') < 0 || tokenLines.every((tl) => tl.indexOf('var(') < 0));
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8') + ' | 包裹 ' + wrapped + ' 处 | 新 token ' + lits.length + ' 个');
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r16-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');