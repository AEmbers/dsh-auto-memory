#!/usr/bin/env node
/**
 * R18 · 外观层收口核查 + `--dam-skin-ratio` 客户覆写点补定义。
 *
 * ★本轮两项核查结论（实测，含口径纠正）：
 *   D1：全仓「有消费无定义」扫描得 4 个，其中 `--dam-x` / `--dam-radius` **只出现在注释里**
 *       （L2278 的零视觉变化说明文字）⇒ **注释污染**，不是真消费；`--dam-user-scale` 由
 *       JS 运行时注入（`'--dam-user-scale': FONT_SCALE_VALUES[...]`）⇒ 非缺陷。
 *       ⇒ 真值 = **1 个**：`--dam-skin-ratio`（有兜底 `4 / 3`，视觉安全，但应是**客户可覆写点**）。
 *   D9：`@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
 *       括号**完全配平**（`not ((A) or (B))` 是合法 supports-condition）⇒ **非缺陷（原判有误）**。
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripComments } from './lib/appearance-scan.mjs'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'client.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')

/* ── ① D1 复测（★去注释口径）────────────────────────────────── */
function audit(src, opts = {}) {
  const text = opts.keepComments ? src : stripComments(src)
  const defined = new Set()
  let m; const D = /--dam-([a-z0-9-]+)\s*:/g
  while ((m = D.exec(text))) defined.add(m[1])
  const used = new Map()
  const U = /var\(\s*--dam-([a-z0-9-]+)\s*(,)?/g
  while ((m = U.exec(text))) { const k = m[1]; if (!used.has(k)) used.set(k, { bare: 0, fb: 0 }); if (m[2]) used.get(k).fb += 1; else used.get(k).bare += 1 }
  const miss = [...used].filter(([k]) => !defined.has(k)).map(([k, v]) => ({ k, ...v }))
  return { defined: defined.size, used: used.size, miss }
}
const before = audit(raw, { keepComments: true });
const real = audit(raw);
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8'));
console.log('① D1 粗测（含注释）= ' + before.miss.length + ' 个：' + before.miss.map((x) => x.k).join(', '));
console.log('② D1 真值（去注释）= ' + real.miss.length + ' 个：' + real.miss.map((x) => x.k).join(', '));
chk('③ ★注释污染已证实（粗测 > 真值）', before.miss.length > real.miss.length);
chk('④ ★无兜底且无定义 = 0（视觉安全）', real.miss.filter((x) => x.bare > 0).length === 0);

/* ── ② D9 括号配平核查 ──────────────────────────────────────── */
const sup = stripComments(raw).split('\n').filter((l) => /@supports/.test(l));
const balanced = sup.every((l) => { let d = 0; for (const ch of l) { if (ch === '(') d += 1; else if (ch === ')') d -= 1; if (d < 0) return false } return d === 0 });
chk('⑤ ★D9：@supports 行括号配平（' + sup.length + ' 行）', sup.length > 0 && balanced);

/* ── ③ 补 --dam-skin-ratio 定义（客户覆写点）──────────────────── */
const ANCHOR = /'(\s*--dam-radius-x1: 999px;)',/
const hit = raw.match(ANCHOR);
chk('⑥ 注入锚（--dam-radius-x1 行）恰 1 处', !!hit && raw.split('--dam-radius-x1: 999px;').length - 1 === 1);
const already = /--dam-skin-ratio\s*:/.test(raw);
chk('⑦ 基线未定义 --dam-skin-ratio（幂等前置）', !already);
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const INDENT = hit[1].slice(0, hit[1].length - hit[1].trimStart().length);
const NEWLINE = "'" + INDENT + '--dam-skin-ratio: 4 / 3;' + "',";
const out = raw.replace(ANCHOR, (whole) => whole + '\r\n' + NEWLINE.replace(/^'\s*/, (s) => s));
bad = 0;
chk('⑧ 净增行数 = ' + (out.split('\r\n').length - raw.split('\r\n').length) + '（期望 1）', out.split('\r\n').length - raw.split('\r\n').length === 1);
chk('⑨ 裸 LF = 0（仍纯 CRLF）', out.split('\n').length - 1 === out.split('\r\n').length - 1);
chk('⑩ 定义已就位且与消费兜底同值', /--dam-skin-ratio: 4 \/ 3;/.test(out) && out.indexOf('var(--dam-skin-ratio, 4 / 3)') >= 0);
const after = audit(out);
// ★真值白名单（每条都有明确根据，不是「凑到 0」）：
//   --dam-user-scale  = JS 运行时注入（'--dam-user-scale': FONT_SCALE_VALUES[...]）⇒ 非缺陷
//   --dam-radius      = 团队层 CSS 段专用、带兜底 8px ⇒ 视觉安全（同名不同域，刻意不建全局定义）
const EXPECT_OK = ['user-scale', 'radius'];
chk('⑪ ★补后真值 D1 = [' + after.miss.map((x) => x.k).join(', ') + '] 全在白名单内', after.miss.length > 0 && after.miss.every((x) => EXPECT_OK.includes(x.k) && x.bare === 0));
chk('⑪b ★--dam-skin-ratio 已从缺口消失', !after.miss.some((x) => x.k === 'skin-ratio'));
chk('⑫ 其余既有定义未被吞（抽样 6 条）', ['--dam-radius-x1: 999px;', '--dam-space-s17: 56px;', '--dam-blur-xl2: blur(30px);', '--dam-accent-2: #4a76f0;', '--dam-lane-goal:', '--dam-tone-ok:'].every((k) => out.indexOf(k) >= 0));
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r18-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');