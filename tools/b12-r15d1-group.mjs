#!/usr/bin/env node
// B12 R15d-1：wb-sidecar.js 新增 groupByDayPre（48 卷 L94–L97 日期分组）。⚠️ 纯 LF。
// ★片段承载全部文本；期望值逐处自算（第 7 条纪律）。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'wb-sidecar.js')
const SN = (f) => readFileSync(join(ROOT, 'tools', 'snippets', f), 'utf8')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1
const ANCHOR = SN('r15d-anchor.txt').replace(/\r?\n$/, '')
const SNIP = SN('r15d-group.txt').replace(/\r?\n/g, '\n')
const INS = SNIP
const EXP_INS = INS.split('\n').length - 1;
const EXP_FN = cnt(INS, 'export function ');
const EXP_G = cnt(INS, 'groupByDayPre');
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' | 行 ' + raw.split('\n').length + ' | CRLF ' + cnt(raw,'\r\n'));
console.log('期望值自算：插入 ' + EXP_INS + ' 行 | +fn ' + EXP_FN + ' | groupByDayPre 出现 ' + EXP_G + ' 次');
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 锚恰 1 次（' + cnt(raw, ANCHOR) + '）', cnt(raw, ANCHOR) === 1)
chk('② 基线无 groupByDayPre', cnt(raw, 'groupByDayPre') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const out = raw.replace(ANCHOR, INS + ANCHOR)
bad = 0
chk('③ 净增行数 = ' + (out.split('\n').length - raw.split('\n').length) + '（期望 ' + EXP_INS + '）', out.split('\n').length - raw.split('\n').length === EXP_INS)
chk('④ 裸 CRLF = 0（本文件纯 LF）', cnt(out, '\r\n') === 0)
chk('⑤ export function 净增 ' + (cnt(out,'export function ') - cnt(raw,'export function ')) + '（期望 ' + EXP_FN + '）', cnt(out,'export function ') - cnt(raw,'export function ') === EXP_FN)
chk('⑥ groupByDayPre 出现 ' + cnt(out,'groupByDayPre') + ' 次（期望 ' + EXP_G + '）', cnt(out,'groupByDayPre') === EXP_G)
for (const [nm, a] of [['buildMemberListPre','export function buildMemberListPre(cards, opts = {}) {'],['filterCardsPre','export function filterCardsPre(cards, opts = {}) {'],['foldCardsPre','export function foldCardsPre(cards, opts = {}) {'],['buildStatCardsPre','export function buildStatCardsPre(cards, opts = {}) {'],['buildRailPre','export function buildRailPre(opts = {}) {'],['railToViewPre','export function railToViewPre(railKey) {']]) {
  chk('⑦ 既有 ' + nm + ' 未被吞（1 次）', cnt(out, a) === 1)
}
chk('⑧ 尾部完整（仍以换行结尾）', out.endsWith('\n'))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r15d1-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');