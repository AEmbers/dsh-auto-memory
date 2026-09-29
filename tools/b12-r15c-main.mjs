#!/usr/bin/env node
// B12 R15c：client.js 主区共享层（工具栏 + 统计卡 + 折叠条）。48 卷 L62–L89 / 46 卷 L122–L124。
// ★改法：纯新增 3 组件 + KanbanBoardRail 内 1 处调用点替换；KanbanBoard 本体仍零改动。
// ★所有源码文本（锚 / 旧调用 / 新调用）一律走片段文件 ⇒ 生成器内零嵌套引号（R15 教训）。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'client.js')
const SN = (f) => readFileSync(join(ROOT, 'tools', 'snippets', f), 'utf8')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1
const DEF_ANCHOR = SN('r15c-anchor.txt').replace(/\r?\n$/, '')
const CALL_OLD = SN('r15c-callold.txt').replace(/\r?\n$/, '')
const CALL_NEW = SN('r15c-callnew.txt').replace(/\r?\n/g, '\r\n').replace(/\r\n$/, '');
const SNIP = SN('r15c-main.txt').replace(/\r?\n/g, '\r\n');
const INS = SNIP.replace(/\r\n$/, '') + '\r\n';
const EXP_INS = INS.split('\r\n').length - 1;
// ★调用点替换本身的 delta 也要算进去（R15c 教训：漏算它 ⇒ 期望比实测少 5 行，第 7 次凭直觉写期望）
const EXP_CALL = CALL_NEW.split('\r\n').length - CALL_OLD.split('\r\n').length;
const EXP_TOTAL = EXP_INS + EXP_CALL;
console.log('期望值自算：插入 ' + EXP_INS + ' 行 + 调用点 ' + EXP_CALL + ' 行 = ' + EXP_TOTAL);
const mask = (s) => s.split('\r\n').map((l) => l.replace(/var\([^)]*\)/g, '')).join('\n')
const bareHex = (s) => (mask(s).match(/#[0-9a-fA-F]{3,8}\b/g) || []).length
const bareRgba = (s) => (mask(s).match(/rgba?\(/g) || []).length
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' | CRLF ' + cnt(raw,'\r\n') + ' | 裸hex ' + bareHex(raw) + ' | 裸rgba ' + bareRgba(raw));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 定义锚恰 1 次（' + cnt(raw, DEF_ANCHOR) + '）', cnt(raw, DEF_ANCHOR) === 1)
chk('② 调用锚恰 1 次（' + cnt(raw, CALL_OLD) + '）', cnt(raw, CALL_OLD) === 1)
chk('③ 基线无 DamRailToolbar / DamStatBar / DamFoldBar', cnt(raw, 'DamRailToolbar') === 0 && cnt(raw, 'DamStatBar') === 0 && cnt(raw, 'DamFoldBar') === 0)
chk('④ 基线无三主区锚', cnt(raw, 'data-dam-toolbar') === 0 && cnt(raw, 'data-dam-statbar') === 0 && cnt(raw, 'data-dam-foldbar') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const out = raw.replace(DEF_ANCHOR, INS + DEF_ANCHOR).replace(CALL_OLD, CALL_NEW);
bad = 0
chk('⑤ 净增行数 = ' + (out.split('\r\n').length - raw.split('\r\n').length) + '（期望 ' + EXP_TOTAL + '，片段自算）', out.split('\r\n').length - raw.split('\r\n').length === EXP_TOTAL)
chk('⑥ 裸 LF = 0（仍纯 CRLF）', !/(^|[^\r])\n/.test(out))
chk('⑦ ★KanbanBoard 定义仍恰 1 次', cnt(out, '    function KanbanBoard(props) {') === 1)
chk('⑧ ★KanbanBoardRail 仍在（1 定义 + 1 调用）', cnt(out, 'KanbanBoardRail') === 2)
chk('⑨ 三组件各 1 定义', cnt(out, 'function DamRailToolbar(props) {') === 1 && cnt(out, 'function DamStatBar(props) {') === 1 && cnt(out, 'function DamFoldBar(props) {') === 1)
chk('⑩ 主区锚齐备（toolbar/search/filter×2/viewgroup/statbar/stat/foldbar/fold-pill）', cnt(out, "'data-dam-toolbar': ''") === 1 && cnt(out, "'data-dam-search': ''") === 1 && cnt(out, "'data-dam-filter': 'actor'") === 1 && cnt(out, "'data-dam-filter': 'lane'") === 1 && cnt(out, "'data-dam-viewgroup': ''") === 1 && cnt(out, "'data-dam-statbar': ''") === 1 && cnt(out, "'data-dam-stat': m.key") === 1 && cnt(out, "'data-dam-foldbar': ''") === 1 && cnt(out, "'data-dam-fold-pill': ''") === 1)
chk('⑪ ★调用行已替换（旧 0 / 新 1）', cnt(out, CALL_OLD) === 0 && cnt(out, CALL_NEW) === 1)
const b0h = bareHex(raw), b1h = bareHex(out), b0r = bareRgba(raw), b1r = bareRgba(out);
chk('⑫ ★裸 hex 不增（' + b0h + ' -> ' + b1h + '）', b1h <= b0h)
chk('⑬ ★裸 rgba 不增（' + b0r + ' -> ' + b1r + '）', b1r <= b0r)
chk('⑭ ES5：片段无 const/let/箭头', !/\b(const|let)\s|=>/.test(SNIP))
chk('⑮ 统计卡标签 4 项逐字（toolbar 视图组 3 项 / 统计元 4 项）', cnt(SNIP, '今日活动') === 0 && cnt(SNIP, "{ key: 'today', tint:") === 1)
for (const [nm, a] of [['KanbanCard', 'function KanbanCard(props) {'], ['data-dam-lane', "'data-dam-lane': lane.key"]]) {
  chk('⑯ 既有 ' + nm + ' 未被吞（≥1）', cnt(out, a) >= 1)
}
chk('⑰ 计数锁：MEMORY_TABS( 不变', cnt(out, 'MEMORY_TABS(') === cnt(raw, 'MEMORY_TABS('))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8') + ' | 裸hex ' + b0h + '->' + b1h + ' | 裸rgba ' + b0r + '->' + b1r);
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r15c-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');