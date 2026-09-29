#!/usr/bin/env node
/**
 * R17 · 外观层残余归零（真·裸 hex 14→0 / 真·裸 rgba 61→0）。
 *
 * ★第 9 条纪律：**度量只能有一份实现** ⇒ 本生成器 `import { scanAppearanceDetail }`
 *   复用 tools/lib/appearance-scan.mjs（R16 的生成器自带一套扫描 ⇒ 只处理了 21/32 种，
 *   留下 14 处 hex 未清，这正是本轮补的洞）。
 *
 * ★两条安全纪律（R16 实证）：
 *   ① **先包裹引用、后插 token 定义**（否则定义行被裹成自引用 `--dam-x: var(--dam-x, #v)`）
 *   ② **按行精确替换**，绝不全局 replace-all —— 因为同一字面量可能同时存在于
 *      「R16 已建的 token 定义行」与「裸用点」；全局替换会打坏定义行。
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanAppearance, scanAppearanceDetail } from './lib/appearance-scan.mjs'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'client.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const EOL = '\r\n'
const lines = raw.split(EOL)

/* ── 1. 度量（唯一实现）────────────────────────────────────────── */
const det = scanAppearanceDetail(raw)
const sites = det.hex.concat(det.rgba)
const values = [...new Set(sites.map((s) => s.value))].sort((a, b) => b.length - a.length)
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | 行 ' + lines.length);
console.log('待处理：hex ' + det.hex.length + ' 处 / rgba ' + det.rgba.length + ' 处，共 ' + values.length + ' 种');

/* ── 2. 复用既有 token 名（同值已有定义就不再新建）─────────────── */
const existing = new Map()
for (const l of lines) { const m = l.match(/--dam-([a-z0-9-]+):\s*([^;]+);/); if (m) { const v = m[2].trim(); if (!existing.has(v)) existing.set(v, m[1]) } }
const SEM = {
  '#4d6bfe': 'lane-goal', '#c2603f': 'lane-dead', '#8a7fbf': 'lane-archive', '#4f7cff': 'accent',
  '#3aa675': 'tone-ok', '#e0a53a': 'tone-warn', '#d66666': 'tone-bad', '#c061c0': 'accent-purple',
  '#8a8f98': 'neutral-mid', '#e08a8a': 'tone-error-soft', '#e8eaed': 'fg-strong',
};
const slug = (v) => {
  if (existing.has(v)) return existing.get(v)
  if (SEM[v]) return SEM[v]
  if (/^#/.test(v)) return 'raw-' + v.slice(1).toLowerCase()
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/)
  if (m) {
    const a = m[4].replace('.', '')
    if (m[1] === m[2] && m[2] === m[3]) return (m[1] === '0' ? 'black' : 'neutral') + '-' + a
    if (m[1] === '255' && m[2] === '255' && m[3] === '255') return 'white-' + a
    return m[1] + '-' + m[2] + '-' + m[3] + '-' + a;
  }
  return 'raw-' + v.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
};
const nameOf = new Map()
for (const v of values) nameOf.set(v, slug(v));
const newTokens = values.filter((v) => !existing.has(v));
console.log('复用既有 token ' + (values.length - newTokens.length) + ' 种；新建 ' + newTokens.length + ' 种');

/* ── 3. 基线断言 ──────────────────────────────────────────────── */
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
const ANCHOR = lines.filter((l) => l.indexOf('--dam-blur-xl2') >= 0);
const ANCHOR_LINE = ANCHOR.length === 1 ? ANCHOR[0] : null;
chk('① token 块锚由源码派生且恰 1 行', !!ANCHOR_LINE);
chk('② 每种字面量都能在其报告行找到（抽样全查）', sites.every((s) => lines[s.line - 1].indexOf(s.value) >= 0));
chk('③ 无重复名字冲突（新建 token 名互不相同）', new Set(newTokens.map((v) => nameOf.get(v))).size === newTokens.length);
chk('④ 新建 token 名不与既有定义重名', newTokens.every((v) => !lines.some((l) => l.indexOf('--dam-' + nameOf.get(v) + ':') >= 0)));
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }

/* ── 4. 按行包裹（不动其它行、不动定义行）────────────────────── */
const byLine = new Map()
for (const s of sites) { if (!byLine.has(s.line)) byLine.set(s.line, new Set()); byLine.get(s.line).add(s.value) }
let wrapped = 0
for (const [ln, set] of byLine) {
  const idx = ln - 1
  if (/--dam-[a-z0-9-]+\s*:/.test(lines[idx])) throw new Error('L' + ln + ' 是定义行，禁止包裹')
  let row = lines[idx]
  const ordered = [...set].sort((a, b) => b.length - a.length)
  for (const v of ordered) {
    const token = 'var(--dam-' + nameOf.get(v) + ', ' + v + ')'
    const n = row.split(v).length - 1
    row = row.split(v).join(token);
    wrapped += n;
  }
  lines[idx] = row;
}
console.log('已包裹 ' + wrapped + ' 处（期望 ' + sites.length + '）');

/* ── 5. 插 token 定义（★在包裹之后）─────────────────────────── */
const INDENT = ANCHOR_LINE.slice(0, ANCHOR_LINE.length - ANCHOR_LINE.trimStart().length);
const tokenLines = newTokens.map((v) => INDENT + "'--dam-" + nameOf.get(v) + ': ' + v + ';' + "',");
const anchorIdx = lines.indexOf(ANCHOR_LINE);
const outLines = lines.slice(0, anchorIdx).concat(tokenLines, lines.slice(anchorIdx));
const out = outLines.join(EOL) + EOL;

/* ── 6. 收尾断言 ─────────────────────────────────────────────── */
bad = 0
const after = scanAppearance(out);
chk('⑤ ★真·裸 hex 归零（实测 ' + after.hex + '）', after.hex === 0);
chk('⑥ ★真·裸 rgba 归零（实测 ' + after.rgba + '）', after.rgba === 0);
chk('⑦ 定义行内不得含 var(（防自引用）', tokenLines.every((l) => l.indexOf('var(') < 0));
chk('⑧ 无自引用包裹 var(--dam-X, var(--dam-X,', out.indexOf('var(--dam-') >= 0 && !/var\(--dam-([a-z0-9-]+),\s*var\(--dam-\1,/.test(out));
chk('⑨ 裸 LF = 0（仍纯 CRLF）', out.split('\n').length - 1 === out.split(EOL).length - 1);
chk('⑩ 尾部完整（以 CRLF 结尾）', out.endsWith(EOL));
chk('⑪ 定义行净增 = ' + newTokens.length, outLines.length - lines.length === newTokens.length);
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r17-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');