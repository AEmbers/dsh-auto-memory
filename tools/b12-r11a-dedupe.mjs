#!/usr/bin/env node
// B12 R11a 看板去重：lib/wb-sidecar.js 新增 dedupeCardsPre（同 section 归并 + 卡内计数）。
// ⚠️ wb-sidecar.js 是纯 LF（实测 CRLF=0），与 client.js/index.js 的 CRLF 纪律不同 ⇒ 本工具全程 LF。
// 依据：43 卷《看板现状取证》环 3（无去重）+ 66 卷裁定「同标题并一张卡 + 卡内标共 N 条」。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'lib', 'wb-sidecar.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1
const lines = raw.split('\n')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | LF ' + (raw.match(/\n/g) || []).length + ' | CRLF ' + (raw.match(/\r\n/g) || []).length);

const SNIP = readFileSync(join(ROOT, 'tools', 'snippets', 'r11a-dedupe.txt'), 'utf8')
const ANCHOR = 'export function buildKanbanPre(index, opts = {}) {'

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('锚① buildKanbanPre 定义恰 1 次（实测 ' + cnt(raw, ANCHOR) + '）', cnt(raw, ANCHOR) === 1)
chk('锚② 基线无 dedupeCardsPre（实测 ' + cnt(raw, 'dedupeCardsPre') + '）', cnt(raw, 'dedupeCardsPre') === 0)
chk('锚③ 基线无 dateOfCardPre', cnt(raw, 'dateOfCardPre') === 0)
chk('锚④ 源头文件为纯 LF（CRLF=0）', (raw.match(/\r\n/g) || []).length === 0)
chk('锚⑤ 片段无 CR（自身为 LF）', SNIP.indexOf('\r') < 0)
chk('锚⑥ 片段尾部含 buildKanbanPre 行（回抄原锚，不吞块）', SNIP.indexOf(ANCHOR) >= 0)
chk('锚⑦ 片段含全部 3 个关键定义', SNIP.indexOf('export function dedupeCardsPre') >= 0 && SNIP.indexOf('function dateOfCardPre') >= 0 && SNIP.indexOf(ANCHOR) >= 0)
if (bad) { console.error('基线校验失败 ' + bad); process.exit(1) }

const out = raw.replace(ANCHOR, SNIP)

bad = 0
const lf0 = cnt(raw, '\n'), lf1 = cnt(out, '\n')
const snipLines = SNIP.split('\n').length;
chk('① LF 增量 = 插入净行数（+' + (lf1 - lf0) + ' / 期望 +' + (snipLines - 1) + '）', lf1 - lf0 === snipLines - 1)
chk('② CRLF 仍为 0', (out.match(/\r\n/g) || []).length === 0)
chk('③ 裸 CR = 0', out.indexOf('\r') < 0)
chk('④ dedupeCardsPre 定义 1 次 + export 1 次', cnt(out, 'export function dedupeCardsPre') === 1)
chk('⑤ dateOfCardPre 定义 1 次', cnt(out, 'function dateOfCardPre') === 1)
chk('⑥ buildKanbanPre 仍恰 1 次（未被吞或复制）', cnt(out, ANCHOR) === 1)
chk('⑦ buildSectionCardsPre 仍恰 1 次（不降级）', cnt(out, 'export function buildSectionCardsPre') === 1)
chk('⑧ buildKanbanMatrixPre / splitSectionsPre / laneOfEntryPre 各仍 1 次',
  cnt(out, 'export function buildKanbanMatrixPre') === 1 && cnt(out, 'export function splitSectionsPre') === 1 && cnt(out, 'export function laneOfEntryPre') === 1)
const exports0 = (raw.match(/^export /gm) || []).length, exports1 = (out.match(/^export /gm) || []).length;
chk('⑨ export 净增 = 1（dedupeCardsPre）（' + exports0 + '→' + exports1 + '）', exports1 === exports0 + 1)
chk('⑩ ★归并只动 title、不动 section（源码形态判据）', SNIP.indexOf("by === 'title' ? c.title : (c.section || c.title)") >= 0 && SNIP.indexOf('section: head.section,') >= 0)
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r11a-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');