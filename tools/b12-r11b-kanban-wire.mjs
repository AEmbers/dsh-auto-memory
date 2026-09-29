#!/usr/bin/env node
// B12 R11b 看板去重端到端接线：lib/index.js 的看板投影路径改走 dedupeCardsPre。
// ⚠️ lib/index.js 是纯 CRLF（15241）。依据 43 卷环 3 + 66 卷裁定「同标题并一张卡 + 卡内标共 N 条」。
// ★守卫锁（smoke-test-graph-mode.mjs，改动前已勘察）：
//   L410 计数锁 buildSectionCardsPre( 调用点 ≥1；L423/L507 import 表含 buildKanbanPre/buildSectionCardsPre/buildKanbanMatrixPre；
//   L509 正则 /boardMode:'graph',cardSource:'section',matrix}/ 必须仍匹配；L450 端到端断言 cardSource==='section'。
//   ⇒ 只把「喂给 buildKanbanPre / buildKanbanMatrixPre 的实参」换成 boardCards，**不动** cardSource 口径与载荷字面量。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'lib', 'index.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const cnt = (s, k) => s.split(k).length - 1
const SNIP = (n) => readFileSync(join(ROOT, 'tools', 'snippets', n), 'utf8').replace(/\r?\n/g, '\r\n').replace(/\r\n$/, '')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + cnt(raw, '\r\n') + ' | 裸LF ' + (raw.match(/(^|[^\r])\n/g) || []).length);

const A1 = [
  '      const docs = await this._collectWhiteboardDocsPre(projectDir, { includeArchive: false })',
  '      const cards = buildSectionCardsPre(this.wbWsKeyPre(projectDir), docs)',
  '      const index = await this._loadSidecarIndexPre(projectDir)',
  '      const kb = buildKanbanPre(index, { now: new Date().toISOString(), cards, perLaneCap: Number(opts.perLaneCap) || 0 })',
].join('\r\n')
const A2 = "      const matrix = buildKanbanMatrixPre(cards, { now: new Date().toISOString() })"
const A3 = "import { WB_SIDECAR_VERSION, buildSidecarEntryPre, buildSidecarEntriesPre, rebuildSidecarIndexPre, expandByTagPre, traceByIdPre, applyAnchorsPre, collectAnchorIdsPre, wbRefPre, normalizeRelPathPre, normalizeTitlePre, buildKanbanPre, buildSectionCardsPre, splitSectionsPre, buildKanbanMatrixPre, ledgerDateOfPre, WB_KANBAN_LANES_PRE_V1 } from './wb-sidecar.js'"

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('锚① 主看板块恰命中 1 次（实测 ' + cnt(raw, A1) + '）', cnt(raw, A1) === 1)
chk('锚② 矩阵行恰命中 1 次（实测 ' + cnt(raw, A2) + '）', cnt(raw, A2) === 1)
chk('锚③ import 行恰命中 1 次（实测 ' + cnt(raw, A3) + '）', cnt(raw, A3) === 1)
chk('锚④ 基线无 dedupeCardsPre（实测 ' + cnt(raw, 'dedupeCardsPre') + '）', cnt(raw, 'dedupeCardsPre') === 0)
chk('锚⑤ 基线无 boardCards（实测 ' + cnt(raw, 'boardCards') + '）', cnt(raw, 'boardCards') === 0)
if (bad) { console.error('基线校验失败 ' + bad); process.exit(1) }

let out = raw;
const S_IMP = SNIP('r11b-import.txt'), S_MAIN = SNIP('r11b-main.txt'), S_MTX = SNIP('r11b-matrix.txt')
const nLines = (s) => s.split('\r\n').length
// ★期望值运行时自算（R10a 教训：不得凭直觉写死）
const EXP_DELTA = (nLines(S_IMP) - nLines(A3)) + (nLines(S_MAIN) - nLines(A1)) + (nLines(S_MTX) - nLines(A2))
const EXP_DEDUPE = cnt(S_IMP, 'dedupeCardsPre') + cnt(S_MAIN, 'dedupeCardsPre') + cnt(S_MTX, 'dedupeCardsPre')
const EXP_BOARD = cnt(S_IMP, 'boardCards') + cnt(S_MAIN, 'boardCards') + cnt(S_MTX, 'boardCards')
console.log('基线（自算）：EXP_DELTA +' + EXP_DELTA + ' | EXP_DEDUPE ' + EXP_DEDUPE + ' | EXP_BOARD ' + EXP_BOARD)
out = out.replace(A3, S_IMP);
out = out.replace(A1, S_MAIN);
out = out.replace(A2, S_MTX);

bad = 0;
const crlf0 = cnt(raw, '\r\n'), crlf1 = cnt(out, '\r\n');
chk('① CRLF 增量 = 插入净行数（+' + (crlf1 - crlf0) + ' / 期望 +' + EXP_DELTA + '）', crlf1 - crlf0 === EXP_DELTA)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('③ dedupeCardsPre 出现 ' + cnt(out, 'dedupeCardsPre') + ' 次（期望 ' + EXP_DEDUPE + '）', cnt(out, 'dedupeCardsPre') === EXP_DEDUPE)
chk('④ boardCards 出现 ' + cnt(out, 'boardCards') + ' 次（期望 ' + EXP_BOARD + '）', cnt(out, 'boardCards') === EXP_BOARD)
chk('⑤ ★cardSource 仍为 section 口径（调用点 ' + cnt(out, 'buildSectionCardsPre(') + '）', cnt(out, 'buildSectionCardsPre(') >= 1)
chk('⑥ ★载荷字面量仍匹配 L509 正则', /boardMode:\s*'graph',\s*cardSource:\s*'section',\s*matrix\s*\}/.test(out))
chk('⑦ ★矩阵调用前缀保持（L508 断言）', out.indexOf('const matrix = buildKanbanMatrixPre(') >= 0)
const imp = /import\s*\{([\s\S]*?)\}\s*from\s*'\.\/wb-sidecar\.js'/.exec(out);
const imported = imp ? imp[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
chk('⑧ ★import 表含三个被守卫的符号 + 新增 dedupeCardsPre',
  ['buildKanbanPre', 'buildSectionCardsPre', 'buildKanbanMatrixPre', 'dedupeCardsPre'].every((s) => imported.indexOf(s) >= 0))
chk('⑨ 既有 R11a 出口的 3 处调用点未动（kanbanCardBody 仍用 cards）', cnt(out, 'buildSectionCardsPre(') === 4)
chk('⑩ stats 审计量 3 行在场', out.indexOf('kb.stats.cardsRaw') >= 0 && out.indexOf('kb.stats.cardsMerged') >= 0 && out.indexOf('kb.stats.deduped') >= 0)
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r11b-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');