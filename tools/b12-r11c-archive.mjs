#!/usr/bin/env node
// B12 R11c-3/4：看板归档 opt-in（默认不读盘，守「用户拍板 C」）+ stats.archived 审计量 + 路由 query 透传。
// ⚠️ lib/index.js 纯 CRLF。★期望值一律运行时自算（R10a/R11b 教训）。
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
const A1 = '  async kanbanBoardData(sessionId, opts = {}) {'
const A2 = '      const docs = await this._collectWhiteboardDocsPre(projectDir, { includeArchive: false })'
const A3 = '        kb.stats.deduped = boardCards.length < cards.length'
const A4 = "          return writeJson(res, 200, await engine.kanbanBoardData(url.searchParams.get('sessionId')))"
let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
for (const [nm, a] of [['签名', A1], ['docs', A2], ['stats', A3], ['route', A4]]) chk('锚-' + nm + ' 恰 1 次（' + cnt(raw, a) + '）', cnt(raw, a) === 1)
chk('基线无 wantArchive', cnt(raw, 'wantArchive') === 0)
chk('基线无 stats.archived', cnt(raw, 'stats.archived') === 0)
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }
const S1 = SNIP('r11c-sig.txt'), S2 = SNIP('r11c-docs.txt'), S3 = SNIP('r11c-stats.txt'), S4 = SNIP('r11c-route.txt')
const nLines = (s) => s.split('\r\n').length
const EXP_DELTA = (nLines(S1) - nLines(A1)) + (nLines(S2) - nLines(A2)) + (nLines(S3) - nLines(A3)) + (nLines(S4) - nLines(A4))
const EXP_WANT = cnt(S1, 'wantArchive') + cnt(S2, 'wantArchive') + cnt(S3, 'wantArchive') + cnt(S4, 'wantArchive')
const EXP_ARCH = cnt(S1, 'stats.archived') + cnt(S2, 'stats.archived') + cnt(S3, 'stats.archived') + cnt(S4, 'stats.archived')
console.log('基线（自算）：EXP_DELTA +' + EXP_DELTA + ' | EXP_WANT ' + EXP_WANT + ' | EXP_ARCH ' + EXP_ARCH)
let out = raw
out = out.replace(A1, S1); out = out.replace(A2, S2); out = out.replace(A3, S3); out = out.replace(A4, S4)
bad = 0
const crlf0 = cnt(raw, '\r\n'), crlf1 = cnt(out, '\r\n')
chk('① CRLF 增量 = 净行数（+' + (crlf1 - crlf0) + ' / 期望 +' + EXP_DELTA + '）', crlf1 - crlf0 === EXP_DELTA)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('③ wantArchive 出现 ' + cnt(out, 'wantArchive') + ' 次（期望 ' + EXP_WANT + '）', cnt(out, 'wantArchive') === EXP_WANT)
chk('④ stats.archived 出现 ' + cnt(out, 'stats.archived') + ' 次（期望 ' + EXP_ARCH + '）', cnt(out, 'stats.archived') === EXP_ARCH)
chk('⑤ ★默认路径仍为 false（守拍板 C）：includeArchive===false 不再出现 ⇒ 由 wantArchive 决定', cnt(out, '{ includeArchive: false }') === 0 && cnt(out, '{ includeArchive: wantArchive }') === 1)
chk('⑥ ★kanbanBoardData 签名仍 1 次（守卫 L314/L408）', cnt(out, 'async kanbanBoardData(') === 1)
chk('⑦ ★L509 载荷正则仍匹配', /boardMode:\s*'graph',\s*cardSource:\s*'section',\s*matrix\s*\}/.test(out))
chk('⑧ ★矩阵调用前缀保持（L508）', out.indexOf('const matrix = buildKanbanMatrixPre(') >= 0)
chk('⑨ 既有 4 处 buildSectionCardsPre 调用点不变', cnt(out, 'buildSectionCardsPre(') === 4)
const EXP_IA = (cnt(S1, 'includeArchive') - 0) + (cnt(S2, 'includeArchive') - cnt(A2, 'includeArchive')) + (cnt(S3, 'includeArchive') - 0) + (cnt(S4, 'includeArchive') - cnt(A4, 'includeArchive'))
chk('⑩ includeArchive 净增 = ' + (cnt(out, 'includeArchive') - cnt(raw, 'includeArchive')) + '（期望 +' + EXP_IA + '，自算）', cnt(out, 'includeArchive') - cnt(raw, 'includeArchive') === EXP_IA)
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r11c-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');