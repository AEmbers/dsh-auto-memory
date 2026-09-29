#!/usr/bin/env node
// B12 R10b 结构层 block 层消费准备：给 10 个 block 节点补 data-dam-kind（值 = 该节点既有 data-dam-block 的值）。
// 依据：28 卷 §3.4（10 类 kind 取值受控）/§3.6（authorSurface.imagery 与 aesthetics 的选择器 [data-dam-block][data-dam-kind="Z"]）。
// 现状取证：data-dam-kind 全仓 0 处，导致上述两个作者面**纸面可写、实际不可命中**；本步把它变成可命中。
// 手法：逐行行内插入（不 split/join 全文，避免 EOL 风险）；插入串与同值 data-dam-block 相邻。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'lib', 'client.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + (raw.match(/\r\n/g) || []).length)

const RE = /'data-dam-block'\s*:\s*'([A-Za-z0-9_-]+)'/;
const KINDS = ['badge', 'list', 'timeline', 'chart', 'stat', 'actions', 'form', 'prose', 'media', 'empty'];

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
const cnt = (s, k) => s.split(k).length - 1;

// ---- 基线 ----
const blockLines = raw.split(/\r?\n/).filter((l) => RE.test(l));
const kindsFound = blockLines.map((l) => l.match(RE)[1]);
console.log('  基线 data-dam-block 行 = ' + blockLines.length + ' | kinds = ' + JSON.stringify(kindsFound));
console.log('  基线 data-dam-kind  = ' + cnt(raw, 'data-dam-kind') + '（期望 0）');
chk('锚① data-dam-block 恰 10 行', blockLines.length === 10)
chk('锚② kinds 去重后恰 10 个且与 LAYOUT_BLOCK_KINDS 同集', new Set(kindsFound).size === 10 && KINDS.every((k) => kindsFound.indexOf(k) >= 0))
chk('锚③ 基线 data-dam-kind = 0', cnt(raw, 'data-dam-kind') === 0)
if (bad) { console.error('基线校验失败 ' + bad + ' 条，拒绝继续'); process.exit(1) }

// ---- 行内插入（只改这 10 行；不改行数、不改 EOL）----
const lines = raw.split('\r\n');
let changed = 0;
const detail = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(RE);
  if (!m) continue;
  const kind = m[1];
  const anchor = "'data-dam-block': '" + kind + "'";
  if (lines[i].split(anchor).length - 1 !== 1) { console.error('L' + (i + 1) + ' 锚串非唯一，拒绝'); process.exit(1) }
  if (lines[i].indexOf('data-dam-kind') >= 0) { detail.push({ line: i + 1, kind, action: 'skip-已有' }); continue }
  const add = anchor + ", 'data-dam-kind': '" + kind + "'";
  const before = lines[i];
  lines[i] = lines[i].replace(anchor, add);
  changed++;
  detail.push({ line: i + 1, kind, action: 'inserted', delta: Buffer.byteLength(lines[i], 'utf8') - Buffer.byteLength(before, 'utf8') });
}
const out = lines.join('\r\n');

// ---- 守恒 ----
const crlf0 = cnt(raw, '\r\n'), crlf1 = cnt(out, '\r\n');
const kind0 = cnt(raw, 'data-dam-kind'), kind1 = cnt(out, 'data-dam-kind');
bad = 0;
chk('① 改动行数 = 10（实测 ' + changed + '）', changed === 10)
chk('② 行数不变（CRLF ' + crlf0 + '→' + crlf1 + '）', crlf0 === crlf1)
chk('③ 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('④ data-dam-kind ' + kind0 + '→' + kind1 + '（期望 +10）', kind1 === kind0 + 10)
chk('⑤ data-dam-block 计数不变（' + cnt(raw, 'data-dam-block') + '→' + cnt(out, 'data-dam-block') + '）', cnt(out, 'data-dam-block') === cnt(raw, 'data-dam-block'))
const rg = (s) => cnt(s, "'data-dam-region':");
const sl = (s) => cnt(s, "'data-dam-slot':");
chk('⑥ region/slot 对象键守恒（' + rg(raw) + '/' + sl(raw) + ' → ' + rg(out) + '/' + sl(out) + '）', rg(out) === rg(raw) && sl(out) === sl(raw))
const mt0 = cnt(raw, 'MEMORY_TABS()'), mt1 = cnt(out, 'MEMORY_TABS()');
chk('⑦ MEMORY_TABS() 计数锁不变（' + mt0 + '→' + mt1 + '）', mt0 === mt1)
const css = (s) => { const a = s.indexOf('var CSS = ['); const b = s.indexOf('].join(', a); return (a >= 0 && b > a) ? s.slice(a, b) : '' };
const cs0 = css(raw), cs1 = css(out);
chk('⑧ CSS 段逐字节零改动（长 ' + cs0.length + '→' + cs1.length + '）', cs0 === cs1 && cs0.length > 0)
const bytes0 = Buffer.byteLength(raw, 'utf8'), bytes1 = Buffer.byteLength(out, 'utf8');
const expDelta = detail.reduce((a, d) => a + (d.delta || 0), 0);
chk('⑨ 字节增量 = 各改动行实际 diff 之和（+' + (bytes1 - bytes0) + ' / 期望 +' + expDelta + '）', (bytes1 - bytes0) === expDelta && expDelta > 0)
console.log('  detail: ' + JSON.stringify(detail));
console.log('B1 = ' + sha16(out) + ' | bytes ' + bytes0 + ' -> ' + bytes1);
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r10b-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');