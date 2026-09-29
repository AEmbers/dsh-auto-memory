#!/usr/bin/env node
// B12 R12a-1：wb-sidecar.js 新增纯函数 buildStatCardsPre（48 卷 L78–L89 四张统计卡）。⚠️ 本文件纯 LF。
// ★期望值一律运行时自算（R10a/R11b/R11c 三次教训）。
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
const ANCHOR = 'export function buildKanbanPre(index, opts = {}) {'
const SNIP = readFileSync(join(ROOT, 'tools', 'snippets', 'r12-statcards.txt'), 'utf8').replace(/\r\n/g, '\n')
// ★净增行数 = **插入文本的换行数**（结构性恒等式：插入点位于行首、原文本逐字节保留）。
//   第 4 次「凭直觉写死期望值」教训 ⇒ 期望值必须由**被插入的文本自身**派生，不由人推算。
const INS_FOR_COUNT = SNIP.replace(/\n$/, '') + '\n\n'
const EXP_INS = INS_FOR_COUNT.split('\n').length - 1
const EXP_EXPORT = cnt(raw, '\nexport function ') + cnt(raw, 'export function ') - cnt(raw, '\nexport function ')*0 + 1
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | 行 ' + raw.split('\n').length + ' | CRLF ' + cnt(raw, '\r\n'));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 锚恰 1 次（' + cnt(raw, ANCHOR) + '）', cnt(raw, ANCHOR) === 1)
chk('② 基线无 buildStatCardsPre', cnt(raw, 'buildStatCardsPre') === 0)
chk('③ 基线导出数 ' + cnt(raw, 'export function ') + '（新增后应为 ' + (cnt(raw, 'export function ') + 1) + '）', true)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const INS = SNIP.replace(/\n$/, '') + '\n\n'
const out = raw.replace(ANCHOR, INS + ANCHOR)
bad = 0
chk('④ 净增行数 = ' + (out.split('\n').length - raw.split('\n').length) + '（期望 ' + EXP_INS + '，自算）', out.split('\n').length - raw.split('\n').length === EXP_INS)
chk('⑤ 裸 CRLF = 0（本文件纯 LF）', cnt(out, '\r\n') === 0)
chk('⑥ buildStatCardsPre 恰 1 次', cnt(out, 'buildStatCardsPre') === 1)
chk('⑦ 导出数 ' + cnt(out, 'export function ') + ' = 基线+1', cnt(out, 'export function ') === cnt(raw, 'export function ') + 1)
chk('⑧ 既有 dedupeCardsPre 仍在（1 次）', cnt(out, 'export function dedupeCardsPre(') === 1)
chk('⑨ 既有 buildKanbanPre 仍在（1 次）', cnt(out, 'export function buildKanbanPre(') === 1)
chk('⑩ 既有 buildKanbanMatrixPre 仍在（1 次）', cnt(out, 'export function buildKanbanMatrixPre(') === 1)
chk('⑪ laneOfEntryPre 未被吞（1 次）', cnt(out, 'export function laneOfEntryPre(') === 1)
chk('⑫ 尾部完整（文件仍以换行结尾）', out.endsWith('\n'))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r12-1-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');