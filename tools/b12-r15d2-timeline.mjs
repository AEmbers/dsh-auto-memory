#!/usr/bin/env node
// B12 R15d-2：client.js 时间轴列表（48 卷 L91–L125）。★全部文本走片段；期望值逐处自算相加。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'client.js')
const SN = (f) => readFileSync(join(ROOT, 'tools', 'snippets', f), 'utf8')
const crlf = (s) => s.replace(/\r?\n/g, '\r\n').replace(/\r\n$/, '')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1
const DEF_ANCHOR = SN('r15c-anchor.txt').replace(/\r?\n$/, '')
const LIST = crlf(SN('r15d2-list.txt'));
const TB_OLD = crlf(SN('r15d2-tb-old.txt'));
const TB_NEW = crlf(SN('r15d2-tb-new.txt'));
const CALL_OLD = crlf(SN('r15d2-call-old.txt'));
const CALL_NEW = crlf(SN('r15d2-call-new.txt'));
const ST_ANCHOR = SN('r15d2-state-anchor.txt').replace(/\r?\n$/, '')
const ST_INS = crlf(SN('r15d2-state-ins.txt'));
// ★期望值逐处自算（第 7 条纪律：Σ 各处 delta）
const dInsert = (LIST + '\r\n').split('\r\n').length - 1;
const dState = (ST_INS + '\r\n').split('\r\n').length - 1;
const dTb = TB_NEW.split('\r\n').length - TB_OLD.split('\r\n').length;
const dCall = CALL_NEW.split('\r\n').length - CALL_OLD.split('\r\n').length;
const EXP_TOTAL = dInsert + dState + dTb + dCall;
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' | CRLF ' + cnt(raw,'\r\n'));
console.log('期望值逐处自算：插入 ' + dInsert + ' + 状态 ' + dState + ' + 工具栏 ' + dTb + ' + 调用点 ' + dCall + ' = ' + EXP_TOTAL);
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 定义锚恰 1 次', cnt(raw, DEF_ANCHOR) === 1)
chk('② 工具栏两行锚恰 1 次', cnt(raw, TB_OLD) === 1)
chk('③ 主区调用块锚恰 1 次', cnt(raw, CALL_OLD) === 1)
chk('④ 状态锚恰 1 次', cnt(raw, ST_ANCHOR) === 1)
chk('⑤ 基线无 DamTimelineList / DamTimelineCard', cnt(raw, 'DamTimelineList') === 0 && cnt(raw, 'DamTimelineCard') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
let out = raw.replace(DEF_ANCHOR, LIST + '\r\n' + DEF_ANCHOR);
out = out.replace(TB_OLD, TB_NEW);
out = out.replace(CALL_OLD, CALL_NEW);
out = out.replace(ST_ANCHOR, ST_INS + '\r\n' + ST_ANCHOR);
bad = 0
chk('⑥ 净增行数 = ' + (out.split('\r\n').length - raw.split('\r\n').length) + '（期望 ' + EXP_TOTAL + '）', out.split('\r\n').length - raw.split('\r\n').length === EXP_TOTAL)
chk('⑦ 裸 LF = 0（仍纯 CRLF）', !/(^|[^\r])\n/.test(out))
chk('⑧ ★KanbanBoard 定义仍恰 1 次', cnt(out, '    function KanbanBoard(props) {') === 1)
chk('⑨ ★KanbanBoardRail 相对基线不变（' + cnt(raw,'KanbanBoardRail') + ' → ' + cnt(out,'KanbanBoardRail') + '）', cnt(out, 'KanbanBoardRail') === cnt(raw, 'KanbanBoardRail'))
chk('⑩ 新组件各 1 定义 + 1 调用', cnt(out, 'function DamTimelineList(props) {') === 1 && cnt(out, 'function DamTimelineCard(props) {') === 1 && cnt(out, 'h(DamTimelineList, { data: props.data, zh: zh })') === 1 && cnt(out, 'h(DamTimelineCard, { key: r.card.id') === 1)
chk('⑪ 时间轴锚齐备（tl / tl-days / tl-group / tl-head / tl-card / tl-rail / tl-dot / tl-body / tl-time / tl-title / tl-summary / tl-meta / tl-empty）', cnt(out, "'data-dam-tl': ''") === 1 && cnt(out, "'data-dam-tl-days': String(g.groups.length)") === 1 && cnt(out, "'data-dam-tl-group': grp.day") === 1 && cnt(out, "'data-dam-tl-head': grp.day") === 1 && cnt(out, "'data-dam-tl-card': c.id || ''") === 1 && cnt(out, "'data-dam-tl-rail': ''") === 1 && cnt(out, "'data-dam-tl-dot': laneKey || ''") === 1 && cnt(out, "'data-dam-tl-body': ''") === 1 && cnt(out, "'data-dam-tl-time': hhmm") === 1 && cnt(out, "'data-dam-tl-title': ''") === 1 && cnt(out, "'data-dam-tl-summary': ''") === 1 && cnt(out, "'data-dam-tl-meta': ''") === 1 && cnt(out, "'data-dam-tl-empty': ''") === 1)
chk('⑫ ★视图态上提（props.view / props.onView 并在调用点传参）', cnt(out, 'var view = props.view || vp[0], setView = props.onView || vp[1]') === 1 && cnt(out, 'h(DamRailToolbar, { zh: zh, view: tview, onView: setTview })') === 1 && cnt(out, 'var tview = tvp[0], setTview = tvp[1]') === 1)
chk('⑬ ★三视图分支在场（list/lane 回落 KanbanBoard）', cnt(out, "tview === 'timeline'") === 1 && cnt(out, 'h(KanbanBoard, { data: props.data }),') === 1)
const mask = (s) => s.split('\r\n').map((l) => l.replace(/var\([^)]*\)/g, '')).join('\n')
const bh = (mask(out).match(/#[0-9a-fA-F]{3,8}\b/g) || []).length, br = (mask(out).match(/rgba?\(/g) || []).length;
chk('⑭ ★裸 hex 不增（94 → ' + bh + '）', bh <= 94)
chk('⑮ ★裸 rgba 不增（201 → ' + br + '）', br <= 201)
chk('⑯ ES5：新片段无 const/let/箭头', !/\b(const|let)\s|=>/.test(LIST + ST_INS));
for (const [nm, a] of [['KanbanCard', 'function KanbanCard(props) {'], ['DamStatBar', 'function DamStatBar(props) {'], ['data-dam-lane', "'data-dam-lane': lane.key"]]) {
  chk('⑰ 既有 ' + nm + ' 未被吞（≥1）', cnt(out, a) >= 1)
}
chk('⑰b ★本片段注释不得含被计数标识符（防注释污染计数）', !/KanbanBoardRail|KanbanBoard\(/.test(LIST + ST_INS + TB_NEW))
chk('⑱ 计数锁：MEMORY_TABS( 不变', cnt(out, 'MEMORY_TABS(') === cnt(raw, 'MEMORY_TABS('))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8') + ' | 裸hex ' + bh + ' | 裸rgba ' + br);
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r15d2-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');