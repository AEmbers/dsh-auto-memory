#!/usr/bin/env node
// B12 R15b：client.js 新增 KanbanBoardRail（左栏 8 项）+ 调用点换用（48 卷 L44–L59 / 42 卷 Q2）。
// ★★改法：**KanbanBoard 本体一个字节不动**；只做「新增组件 + 调用点替换」⇒ 零搬运风险。
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
const DEF_ANCHOR = '    function KanbanBoard(props) {'
const CALL_OLD = "        rows.unshift(h(Card, { title: (locale === 'zh' ? '白板看板 · 全流程可视化' : 'Whiteboard kanban · full flow') }, h('div', { 'data-dam-content': '' }, h(KanbanBoard, { data: kbData }))))";
const CALL_NEW = "        rows.unshift(h(Card, { title: (locale === 'zh' ? '白板看板 · 全流程可视化' : 'Whiteboard kanban · full flow') }, h('div', { 'data-dam-content': '' }, h(KanbanBoardRail, { data: kbData, zh: locale === 'zh' }))))";
const SNIP = readFileSync(join(ROOT, 'tools', 'snippets', 'r15b-rail.txt'), 'utf8').replace(/\r?\n/g, '\r\n');
const INS = SNIP.replace(/\r\n$/, '') + '\r\n';
const EXP_INS = INS.split('\r\n').length - 1;
const bareHex = (s) => { let n = 0; for (const l of s.split('\r\n')) { const m = l.replace(/var\([^)]*\)/g,'').match(/#[0-9a-fA-F]{3,8}\b/g); if (m) n += m.length } return n };
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' | CRLF ' + cnt(raw,'\r\n') + ' | 裸hex ' + bareHex(raw));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 定义锚恰 1 次（' + cnt(raw, DEF_ANCHOR) + '）', cnt(raw, DEF_ANCHOR) === 1)
chk('② 调用锚恰 1 次（' + cnt(raw, CALL_OLD) + '）', cnt(raw, CALL_OLD) === 1)
chk('③ 基线无 KanbanBoardRail', cnt(raw, 'KanbanBoardRail') === 0)
chk('④ 基线无 data-dam-rail', cnt(raw, 'data-dam-rail') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const out = raw.replace(DEF_ANCHOR, INS + DEF_ANCHOR).replace(CALL_OLD, CALL_NEW)
bad = 0
chk('⑤ 净增行数 = ' + (out.split('\r\n').length - raw.split('\r\n').length) + '（期望 ' + EXP_INS + '，由片段自算）', out.split('\r\n').length - raw.split('\r\n').length === EXP_INS)
chk('⑥ 裸 LF = 0（仍纯 CRLF）', !/(^|[^\r])\n/.test(out))
chk('⑦ ★KanbanBoard 定义仍恰 1 次（本体未被吞）', cnt(out, DEF_ANCHOR) === 1)
chk('⑧ ★KanbanBoardRail 定义 1 次 + 调用 1 次（共 2）', cnt(out, 'KanbanBoardRail') === 2)
chk('⑨ 左栏锚齐备（rail / nav / item / active / foot / rail-main / rail-wrap）', cnt(out, "'data-dam-rail': ''") === 1 && cnt(out, "'data-dam-rail-nav': ''") === 1 && cnt(out, "'data-dam-rail-item': it.key") === 1 && cnt(out, "'data-dam-rail-active': on ? '1' : '0'") === 1 && cnt(out, "'data-dam-rail-foot': ''") === 1 && cnt(out, "'data-dam-rail-main': ''") === 1 && cnt(out, "'data-dam-rail-wrap': ''") === 1)
chk('⑩ 8 项常量在场（DAM_RAIL_ITEMS 出现 ≥2：定义 + 消费）', cnt(out, 'DAM_RAIL_ITEMS') >= 2)
// ★★原调用行逐字节守恒（最强断言：只改了 KadonBoard→KanbanBoardRail 一处）
chk('⑪ ★调用行已替换（旧 0 次 / 新 1 次）', cnt(out, CALL_OLD) === 0 && cnt(out, CALL_NEW) === 1)
const bh0 = bareHex(raw), bh1 = bareHex(out);
chk('⑫ ★裸 hex 不增（' + bh0 + ' -> ' + bh1 + '）', bh1 <= bh0)
chk('⑬ ES5：新增片段无 const/let/箭头', !/\b(const|let)\s|=>/.test(SNIP))
for (const [nm, a] of [['KanbanCard', 'function KanbanCard(props) {'], ['KanbanDrawerBody', 'function KanbanDrawerBody(props) {'], ['data-dam-lane', "'data-dam-lane': lane.key"]]) {
  chk('⑭ 既有 ' + nm + ' 未被吞（≥1）', cnt(out, a) >= 1)
}
chk('⑮ 13 页签计数锁不受影响（MEMORY_TABS( 仍 3）', cnt(out, 'MEMORY_TABS(') === cnt(raw, 'MEMORY_TABS('))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8') + ' | 裸hex ' + bh0 + ' -> ' + bh1);
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r15b-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');