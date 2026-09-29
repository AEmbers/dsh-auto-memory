#!/usr/bin/env node
// B12 R12a-2：宿主 kanbanBoardData 接线 —— stats.cards4 = buildStatCardsPre(...)（48 卷 L78–L89）。
// ⚠️ lib/index.js 纯 CRLF。★期望值一律**由片段/插入文本自身派生**（第 4 次教训）。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'index.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1
const CRLF = (t) => t.replace(/\r?\n/g, '\r\n')
const rd = (n) => CRLF(readFileSync(join(ROOT, 'tools', 'snippets', n), 'utf8'))
const A_IMP = "import { WB_SIDECAR_VERSION, buildSidecarEntryPre, buildSidecarEntriesPre, rebuildSidecarIndexPre, expandByTagPre, traceByIdPre, applyAnchorsPre, collectAnchorIdsPre, wbRefPre, normalizeRelPathPre, normalizeTitlePre, buildKanbanPre, buildSectionCardsPre, dedupeCardsPre, splitSectionsPre, buildKanbanMatrixPre, ledgerDateOfPre, WB_KANBAN_LANES_PRE_V1 } from './wb-sidecar.js'"
const A_ST  = '        kb.stats.archived = { included: wantArchive, count: archDocs }'
const S_IMP = rd('r12-import.txt').replace(/\r\n$/, '')
const S_ST  = rd('r12-stats.txt').replace(/\r\n$/, '')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + cnt(raw, '\r\n'));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('① 导入锚恰 1 次（' + cnt(raw, A_IMP) + '）', cnt(raw, A_IMP) === 1)
chk('② stats 锚恰 1 次（' + cnt(raw, A_ST) + '）', cnt(raw, A_ST) === 1)
chk('③ 基线无 buildStatCardsPre', cnt(raw, 'buildStatCardsPre') === 0)
chk('④ 基线无 cards4', cnt(raw, 'cards4') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
// 期望净行数 = 两处 (插入文本行数 - 被替换文本行数)（全部由文本自身派生）
const dImp = (S_IMP.split('\r\n').length) - (A_IMP.split('\r\n').length)
const dSt  = (S_ST.split('\r\n').length) - (A_ST.split('\r\n').length)
const EXP_D = dImp + dSt
const EXP_STAT = cnt(S_IMP, 'buildStatCardsPre') + cnt(S_ST, 'buildStatCardsPre')
const EXP_C4   = cnt(S_IMP, 'cards4') + cnt(S_ST, 'cards4')
console.log('基线（自算）：EXP_DELTA ' + EXP_D + '（导入 ' + dImp + ' / stats ' + dSt + '）| EXP_STAT ' + EXP_STAT + ' | EXP_C4 ' + EXP_C4);
let out = raw.replace(A_IMP, S_IMP).replace(A_ST, S_ST)
bad = 0
chk('⑤ CRLF 增量 = ' + (cnt(out, '\r\n') - cnt(raw, '\r\n')) + '（期望 ' + EXP_D + '，自算）', cnt(out, '\r\n') - cnt(raw, '\r\n') === EXP_D)
chk('⑥ 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('⑦ buildStatCardsPre 出现 ' + cnt(out, 'buildStatCardsPre') + ' 次（期望 ' + EXP_STAT + '：导入 1 + 调用 1）', cnt(out, 'buildStatCardsPre') === EXP_STAT)
chk('⑧ cards4 出现 ' + cnt(out, 'cards4') + ' 次（期望 ' + EXP_C4 + '）', cnt(out, 'cards4') === EXP_C4)
chk('⑨ ★既有 stats.archived 仍在（1 次）', cnt(out, 'kb.stats.archived = { included: wantArchive, count: archDocs }') === 1)
// ★守恒式（由 raw 派生，非硬编码）：既有 cardSource 载荷必须**逐字节不变**。
const CS = "cardSource: 'section'"
chk('⑩ ★既有 cardSource 载荷守恒（' + cnt(out, CS) + ' === raw ' + cnt(raw, CS) + '）', cnt(out, CS) === cnt(raw, CS))
chk('⑪ ★L509 载荷正则仍匹配', /boardMode:\s*'graph',\s*cardSource:\s*'section',\s*matrix\s*\}/.test(out))
chk('⑫ ★kanbanBoardData 签名仍 1 次', cnt(out, 'async kanbanBoardData(') === 1)
chk('⑬ ★wb-sidecar 导入集合仅 +1（新增 buildStatCardsPre）', cnt(out, "from './wb-sidecar.js'") === 1 && out.indexOf(', buildStatCardsPre } from') >= 0)
chk('⑭ readdir 已可用（L22 导入）', /from 'node:fs\/promises'/.test(out))

console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r12-2-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');