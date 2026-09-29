#!/usr/bin/env node
// B12 R13a：wb-sidecar.js 新增纯函数 foldCardsPre（44 卷 L13 + 46 卷 L124 折叠条）。⚠️ 本文件纯 LF。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'wb-sidecar.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1
const ANCHOR = '/**\n * ★R12（48 卷 L78–L89 统计条）：卡片集合 → **四'
const SNIP = readFileSync(join(ROOT, 'tools', 'snippets', 'r13-fold.txt'), 'utf8').replace(/\r\n/g, '\n')
const INS = SNIP.replace(/\n$/, '') + '\n\n'
// ★期望值由插入文本自身派生（第 4 次教训后纪律）
const EXP_INS = INS.split('\n').length - 1
const EXP_FOLD = cnt(INS, 'foldCardsPre')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | 行 ' + raw.split('\n').length + ' | CRLF ' + cnt(raw, '\r\n'));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 锚恰 1 次（' + cnt(raw, ANCHOR) + '）', cnt(raw, ANCHOR) === 1)
chk('② 基线无 foldCardsPre', cnt(raw, 'foldCardsPre') === 0)
console.log('基线（自算）：EXP_INS ' + EXP_INS + ' | EXP_FOLD ' + EXP_FOLD + ' | 导出 ' + cnt(raw, 'export function ') + ' → ' + (cnt(raw, 'export function ') + 1));
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const out = raw.replace(ANCHOR, INS + ANCHOR)
bad = 0
chk('③ 净增行数 = ' + (out.split('\n').length - raw.split('\n').length) + '（期望 ' + EXP_INS + '，自算）', out.split('\n').length - raw.split('\n').length === EXP_INS)
chk('④ 裸 CRLF = 0（本文件纯 LF）', cnt(out, '\r\n') === 0)
chk('⑤ foldCardsPre 出现 ' + cnt(out, 'foldCardsPre') + ' 次（期望 ' + EXP_FOLD + '）', cnt(out, 'foldCardsPre') === EXP_FOLD)
chk('⑥ 导出数 ' + cnt(out, 'export function ') + ' = 基线+1', cnt(out, 'export function ') === cnt(raw, 'export function ') + 1)
for (const [nm, a] of [['buildStatCardsPre', 'export function buildStatCardsPre(cards, opts = {}) {'], ['buildKanbanPre', 'export function buildKanbanPre(index, opts = {}) {'], ['dedupeCardsPre', 'export function dedupeCardsPre(cards, opts = {}) {'], ['laneOfEntryPre', 'export function laneOfEntryPre(']]) {
  chk('⑦ 既有 ' + nm + ' 未被吞（1 次）', cnt(out, a) === 1)
}
chk('⑧ 尾部完整（仍以换行结尾）', out.endsWith('\n'))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r13a-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');