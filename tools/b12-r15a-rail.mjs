#!/usr/bin/env node
// B12 R15a：wb-sidecar.js 新增 WB_RAIL_ITEMS_PRE_V1 + buildRailPre + railToViewPre（48 卷 L54–L57 / 42 卷 Q2）。⚠️ 纯 LF。
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
const ANCHOR = '/**\n * ★R14（70 卷 L95'
const SNIP = readFileSync(join(ROOT, 'tools', 'snippets', 'r15-rail.txt'), 'utf8').replace(/\r\n/g, '\n')
const INS = SNIP.replace(/\n$/, '') + '\n\n'
const EXP_INS = INS.split('\n').length - 1
const EXP_FN = cnt(INS, 'export function ')
const EXP_CN = cnt(INS, 'export const ')
const EXP_RAIL = cnt(INS, 'buildRailPre')
const EXP_VIEW = cnt(INS, 'railToViewPre')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' | 行 ' + raw.split('\n').length + ' | CRLF ' + cnt(raw,'\r\n'));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 锚恰 1 次（' + cnt(raw, ANCHOR) + '）', cnt(raw, ANCHOR) === 1)
chk('② 基线无 buildRailPre', cnt(raw, 'buildRailPre') === 0)
chk('③ 基线无 railToViewPre', cnt(raw, 'railToViewPre') === 0)
chk('④ 基线无 WB_RAIL_ITEMS_PRE_V1', cnt(raw, 'WB_RAIL_ITEMS_PRE_V1') === 0)
console.log('基线（自算）：EXP_INS ' + EXP_INS + ' | +fn ' + EXP_FN + ' | +const ' + EXP_CN + ' | EXP_RAIL ' + EXP_RAIL + ' | EXP_VIEW ' + EXP_VIEW);
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const out = raw.replace(ANCHOR, INS + ANCHOR)
bad = 0
chk('⑤ 净增行数 = ' + (out.split('\n').length - raw.split('\n').length) + '（期望 ' + EXP_INS + '，自算）', out.split('\n').length - raw.split('\n').length === EXP_INS)
chk('⑥ 裸 CRLF = 0（本文件纯 LF）', cnt(out, '\r\n') === 0)
chk('⑦ export function 净增 ' + (cnt(out,'export function ') - cnt(raw,'export function ')) + '（期望 ' + EXP_FN + '）', cnt(out,'export function ') - cnt(raw,'export function ') === EXP_FN)
chk('⑧ export const 净增 ' + (cnt(out,'export const ') - cnt(raw,'export const ')) + '（期望 ' + EXP_CN + '）', cnt(out,'export const ') - cnt(raw,'export const ') === EXP_CN)
chk('⑨ buildRailPre 出现 ' + cnt(out,'buildRailPre') + ' 次（期望 ' + EXP_RAIL + '）', cnt(out,'buildRailPre') === EXP_RAIL)
chk('⑩ railToViewPre 出现 ' + cnt(out,'railToViewPre') + ' 次（期望 ' + EXP_VIEW + '）', cnt(out,'railToViewPre') === EXP_VIEW)
for (const [nm, a] of [['buildMemberListPre', 'export function buildMemberListPre(cards, opts = {}) {'], ['filterCardsPre', 'export function filterCardsPre(cards, opts = {}) {'], ['foldCardsPre', 'export function foldCardsPre(cards, opts = {}) {'], ['buildStatCardsPre', 'export function buildStatCardsPre(cards, opts = {}) {'], ['buildKanbanPre', 'export function buildKanbanPre(index, opts = {}) {'], ['splitSectionsPre', 'export function splitSectionsPre(text) {']]) {
  chk('⑪ 既有 ' + nm + ' 未被吞（1 次）', cnt(out, a) === 1)
}
chk('⑫ 尾部完整（仍以换行结尾）', out.endsWith('\n'))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r15a-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');