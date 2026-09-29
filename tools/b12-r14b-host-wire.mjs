#!/usr/bin/env node
// B12 R14b：宿主接线 —— stats.members + kb.memberList + 路由 actor 透传（70 卷 L95 / fe02 屏② data-dam-team-member-filter）。
// ⚠️ lib/index.js 纯 CRLF。★期望值一律由片段/插入文本自身派生（第 5 次教训纪律）。
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
const A1 = "import { WB_SIDECAR_VERSION, buildSidecarEntryPre, buildSidecarEntriesPre, rebuildSidecarIndexPre, expandByTagPre, traceByIdPre, applyAnchorsPre, collectAnchorIdsPre, wbRefPre, normalizeRelPathPre, normalizeTitlePre, buildKanbanPre, buildSectionCardsPre, dedupeCardsPre, splitSectionsPre, buildKanbanMatrixPre, ledgerDateOfPre, WB_KANBAN_LANES_PRE_V1, buildStatCardsPre, foldCardsPre } from './wb-sidecar.js'"
const A2 = '        kb.stats.fold = { foldDays: foldRes.foldDays, days: foldRes.folded.days, count: foldRes.folded.count, hasMore: foldRes.hasMore }'
const A3 = [
  "          const _fdRaw = url.searchParams.get('foldDays')",
  "          const _fd = (_fdRaw === null || _fdRaw === '') ? undefined : Number(_fdRaw)",
  "          return writeJson(res, 200, await engine.kanbanBoardData(url.searchParams.get('sessionId'), { includeArchive: url.searchParams.get('includeArchive') === '1', foldDays: Number.isFinite(_fd) ? _fd : undefined }))",
].join('\r\n')
const S1 = rd('r14-import.txt'), S2 = rd('r14-stats.txt'), S3 = rd('r14-route.txt')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' | CRLF ' + cnt(raw,'\r\n'));
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
for (const [nm, a] of [['导入', A1], ['stats', A2], ['route', A3]]) chk('锚-' + nm + ' 恰 1 次（' + cnt(raw, a) + '）', cnt(raw, a) === 1)
chk('基线无 buildMemberListPre', cnt(raw, 'buildMemberListPre') === 0)
chk('基线无 filterCardsPre', cnt(raw, 'filterCardsPre') === 0)
chk('基线无 kb.stats.members', cnt(raw, 'kb.stats.members') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const d1 = S1.split('\r\n').length - A1.split('\r\n').length
const d2 = S2.split('\r\n').length - A2.split('\r\n').length
const d3 = S3.split('\r\n').length - A3.split('\r\n').length
const EXP_D = d1 + d2 + d3
const EXP_MEM = cnt(S1,'buildMemberListPre') + cnt(S2,'buildMemberListPre') + cnt(S3,'buildMemberListPre') - (cnt(A1,'buildMemberListPre') + cnt(A2,'buildMemberListPre') + cnt(A3,'buildMemberListPre'))
const EXP_FIL = cnt(S1,'filterCardsPre') + cnt(S2,'filterCardsPre') + cnt(S3,'filterCardsPre') - (cnt(A1,'filterCardsPre') + cnt(A2,'filterCardsPre') + cnt(A3,'filterCardsPre'))
const EXP_ACT = cnt(S1,'actor') + cnt(S2,'actor') + cnt(S3,'actor');
console.log('基线（自算）：EXP_DELTA ' + EXP_D + '（导入 ' + d1 + ' / stats ' + d2 + ' / route ' + d3 + '）| EXP_MEM ' + EXP_MEM + ' | EXP_FIL ' + EXP_FIL + ' | EXP_ACTOR ' + EXP_ACT);
const out = raw.replace(A1, S1).replace(A2, S2).replace(A3, S3)
bad = 0
chk('① CRLF 增量 = ' + (cnt(out,'\r\n') - cnt(raw,'\r\n')) + '（期望 ' + EXP_D + '，自算）', cnt(out,'\r\n') - cnt(raw,'\r\n') === EXP_D)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('③ buildMemberListPre 净增 ' + (cnt(out,'buildMemberListPre') - cnt(raw,'buildMemberListPre')) + '（期望 ' + EXP_MEM + '）', cnt(out,'buildMemberListPre') - cnt(raw,'buildMemberListPre') === EXP_MEM)
chk('④ filterCardsPre 净增 ' + (cnt(out,'filterCardsPre') - cnt(raw,'filterCardsPre')) + '（期望 ' + EXP_FIL + '）', cnt(out,'filterCardsPre') - cnt(raw,'filterCardsPre') === EXP_FIL)
// ★守恒式（由 raw 派生）：既有 payload 契约必须逐字节不变
const CS = "cardSource: 'section'", C4 = 'kb.stats.cards4 = stat4.cards', FD = 'kb.stats.fold = { foldDays: foldRes.foldDays', IA = "includeArchive: url.searchParams.get('includeArchive') === '1'", IDX = 'async kanbanBoardData('
chk('⑤ ★cardSource 守恒（' + cnt(out,CS) + ' === raw ' + cnt(raw,CS) + '）', cnt(out,CS) === cnt(raw,CS))
chk('⑥ ★L509 载荷正则仍匹配', /boardMode:\s*'graph',\s*cardSource:\s*'section',\s*matrix\s*\}/.test(out))
chk('⑦ ★R12 cards4 仍在（1 次）', cnt(out, C4) === 1)
chk('⑧ ★R13 stats.fold 仍在（1 次）', cnt(out, FD) === 1)
chk('⑨ ★R11c includeArchive 透传仍在（1 次）', cnt(out, IA) === 1)
chk('⑩ ★kanbanBoardData 签名仍 1 次', cnt(out, IDX) === 1)
chk('⑪ ★memberList 是独立顶层键（不是塞进 lanes）', cnt(out, 'kb.memberList = memberRes.members') === 1)
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r14b-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');