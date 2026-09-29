#!/usr/bin/env node
// B12 R13b：宿主接线 foldCardsPre —— stats.fold + 路由 foldDays 透传。⚠️ lib/index.js 纯 CRLF。
// ★期望值一律**由片段/插入文本自身派生**（第 4 次教训纪律）。
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
const rd = (n) => CRLF(readFileSync(join(ROOT, 'tools', 'snippets', n), 'utf8')).replace(/\r\n$/, '')
const A1 = "import { WB_SIDECAR_VERSION, buildSidecarEntryPre, buildSidecarEntriesPre, rebuildSidecarIndexPre, expandByTagPre, traceByIdPre, applyAnchorsPre, collectAnchorIdsPre, wbRefPre, normalizeRelPathPre, normalizeTitlePre, buildKanbanPre, buildSectionCardsPre, dedupeCardsPre, splitSectionsPre, buildKanbanMatrixPre, ledgerDateOfPre, WB_KANBAN_LANES_PRE_V1, buildStatCardsPre } from './wb-sidecar.js'"
const A2 = '        kb.stats.cards4 = stat4.cards'
const A3 = "          return writeJson(res, 200, await engine.kanbanBoardData(url.searchParams.get('sessionId'), { includeArchive: url.searchParams.get('includeArchive') === '1' }))"
const S1 = rd('r13-import.txt'), S2 = rd('r13-stats.txt'), S3 = rd('r13-route.txt')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + cnt(raw, '\r\n'));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
for (const [nm, a] of [['导入', A1], ['stats', A2], ['route', A3]]) chk('锚-' + nm + ' 恰 1 次（' + cnt(raw, a) + '）', cnt(raw, a) === 1)
chk('基线无 foldCardsPre', cnt(raw, 'foldCardsPre') === 0)
chk('基线无 stats.fold', cnt(raw, 'stats.fold') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const d1 = S1.split('\r\n').length - A1.split('\r\n').length
const d2 = S2.split('\r\n').length - A2.split('\r\n').length
const d3 = S3.split('\r\n').length - A3.split('\r\n').length
const EXP_D = d1 + d2 + d3
const EXP_FOLD = cnt(S1,'foldCardsPre') - cnt(A1,'foldCardsPre') + cnt(S2,'foldCardsPre') - cnt(A2,'foldCardsPre') + cnt(S3,'foldCardsPre') - cnt(A3,'foldCardsPre')
const EXP_STATF = cnt(S1,'stats.fold') + cnt(S2,'stats.fold') + cnt(S3,'stats.fold')
console.log('基线（自算）：EXP_DELTA ' + EXP_D + '（导入 ' + d1 + ' / stats ' + d2 + ' / route ' + d3 + '）| EXP_FOLD ' + EXP_FOLD + ' | EXP_STATF ' + EXP_STATF);
const out = raw.replace(A1, S1).replace(A2, S2).replace(A3, S3)
bad = 0
chk('① CRLF 增量 = ' + (cnt(out,'\r\n') - cnt(raw,'\r\n')) + '（期望 ' + EXP_D + '，自算）', cnt(out,'\r\n') - cnt(raw,'\r\n') === EXP_D)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('③ foldCardsPre 净增 ' + (cnt(out,'foldCardsPre') - cnt(raw,'foldCardsPre')) + '（期望 ' + EXP_FOLD + '）', cnt(out,'foldCardsPre') - cnt(raw,'foldCardsPre') === EXP_FOLD)
chk('④ stats.fold 出现 ' + cnt(out,'stats.fold') + ' 次（期望 ' + EXP_STATF + '）', cnt(out,'stats.fold') === EXP_STATF)
// ★守恒式（由 raw 派生）：既有 payload 契约必须逐字节不变
const CS = "cardSource: 'section'", IA = "includeArchive: url.searchParams.get('includeArchive') === '1'", C4 = 'kb.stats.cards4 = stat4.cards'
chk('⑤ ★cardSource 守恒（' + cnt(out,CS) + ' === raw ' + cnt(raw,CS) + '）', cnt(out,CS) === cnt(raw,CS))
chk('⑥ ★L509 载荷正则仍匹配', /boardMode:\s*'graph',\s*cardSource:\s*'section',\s*matrix\s*\}/.test(out))
chk('⑦ ★R11c includeArchive 透传仍在（1 次）', cnt(out, IA) === 1)
chk('⑧ ★R12 cards4 仍在（1 次）', cnt(out, C4) === 1)
chk('⑨ ★kanbanBoardData 签名仍 1 次', cnt(out, 'async kanbanBoardData(') === 1)
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r13b-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');