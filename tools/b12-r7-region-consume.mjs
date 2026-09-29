#!/usr/bin/env node
// B12 R7 配置层对外消费 A：region order + hidden（依据 56/62/68/70 卷）。
// ★插入文本全部由 tools/snippets/*.txt 承载（CRLF），避免 JS 字符串转义（R3/R5/R6 教训）。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'lib', 'client.js')
const SNIP = (n) => readFileSync(join(ROOT, 'tools', 'snippets', n), 'utf8').replace(/\r?\n/g, '\r\n').replace(/\r\n$/, '')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + (raw.match(/\r\n/g) || []).length)

const A2 = '      if (!state) return h(Loading)'
const A3 = "    function useTick() { return useReducer(function (x) { return x + 1 }, 0) }"
const A1 = "    exports.inject = ['slots', 'sessions', 'remote', 'remote.session']"
const S1 = SNIP('r7-fn.txt')
const S2 = SNIP('r7-effect.txt')
const S3 = SNIP('r7-exports.txt')

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
const cnt = (s, k) => s.split(k).length - 1
chk('锚① useTick 定义唯一（=1，实测 ' + cnt(raw, A3) + '）', cnt(raw, A3) === 1)
chk('锚② if(!state) return 唯一（=1，实测 ' + cnt(raw, A2) + '）', cnt(raw, A2) === 1)
chk('锚③ exports.inject 唯一（=1，实测 ' + cnt(raw, A1) + '）', cnt(raw, A1) === 1)
chk('锚④ 基线无 layoutRegionPlanPre（=0）', cnt(raw, 'layoutRegionPlanPre') === 0)
chk('锚⑤ 基线无 applyLayoutRegionsPre（=0）', cnt(raw, 'applyLayoutRegionsPre') === 0)
const ex0 = raw.split(/\r?\n/).filter(function (l) { return /^\s*exports\._/.test(l) }).length
console.log('  基线 exports._ 数 = ' + ex0)
if (bad) { console.error('锚点校验失败 ' + bad + ' 条，拒绝继续'); process.exit(1) }

let out = raw
out = out.replace(A3, S1 + '\r\n' + A3)
out = out.replace(A2, S2 + '\r\n\r\n' + A2)
out = out.replace(A1, A1 + '\r\n' + S3)

const crlf0 = (raw.match(/\r\n/g) || []).length, crlf1 = (out.match(/\r\n/g) || []).length
const addLines = (S1.split('\r\n').length) + (S2.split('\r\n').length + 1) + (S3.split('\r\n').length)
bad = 0
chk('① CRLF 增量 = 插入行数（+' + (crlf1 - crlf0) + ' / 期望 +' + addLines + '）', crlf1 - crlf0 === addLines)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('③ 定义恰 1 次：layoutRegionPlanPre', cnt(out, 'function layoutRegionPlanPre(') === 1)
chk('④ 定义恰 1 次：applyLayoutRegionsPre', cnt(out, 'function applyLayoutRegionsPre(') === 1)
// ★精确判据：只数「赋值语句」形态，排除注释里提到的 exports._*（本轮实证的第二个假红）
const expCount = (s) => s.split(/\r?\n/).filter(function (l) { return /^\s*exports\._/.test(l) }).length
const ex1 = expCount(out)
chk('⑤ exports._ 赋值语句增 2（' + ex0 + '→' + ex1 + '）', ex1 === ex0 + 2)
// ★精确判据：只数「属性锚点」形态（'data-dam-X': 作为对象键），
//   不数选择器字符串 / getAttribute 参数 / 行内注释 —— 三者都不是锚点（2026-09-27 本轮实证：
//   子串计数会把新加的 [data-dam-region] 选择器算成锚点，制造假红）。
const anchors = (s, k) => (s.match(new RegExp("'", 'g')) ? 0 : 0) + s.split("'" + k + "':").length - 1
const rg0 = anchors(raw, 'data-dam-region'), rg1 = anchors(out, 'data-dam-region')
const sl0 = anchors(raw, 'data-dam-slot'), sl1 = anchors(out, 'data-dam-slot')
const bl0 = anchors(raw, 'data-dam-block'), bl1 = anchors(out, 'data-dam-block')
chk('⑥ 属性锚点守恒 region ' + rg0 + '→' + rg1 + ' / slot ' + sl0 + '→' + sl1 + ' / block ' + bl0 + '→' + bl1,
  rg0 === rg1 && sl0 === sl1 && bl0 === bl1 && rg0 === 13 && sl0 === 426 && bl0 === 10)
chk('⑦ MEMORY_TABS() 调用数不变（计数锁=2）', cnt(out, 'MEMORY_TABS()') === cnt(raw, 'MEMORY_TABS()'))
// ★精确判据：把 CSS 段（var CSS = [ … ].join）按字符区间切出来，只在段内查 —— 62 卷 §二 纪律 1
const cssSeg = (s) => { const a = s.indexOf('var CSS = ['); if (a < 0) return ''; const b = s.indexOf('].join(', a); return b > a ? s.slice(a, b) : '' }
const cs0 = cssSeg(raw), cs1 = cssSeg(out)
const cssHits = (s) => ['data-dam-region', 'data-dam-slot', 'data-dam-block'].reduce(function (n, k) { return n + s.split(k).length - 1 }, 0)
chk('⑧ CSS 段零新增（段内 data-dam-region/slot/block 命中 ' + cssHits(cs0) + '→' + cssHits(cs1) + '，段长 ' + cs0.length + '→' + cs1.length + '）',
  cssHits(cs0) === cssHits(cs1) && cs0.length === cs1.length)
console.log('  region=' + cnt(out,'data-dam-region') + ' slot=' + cnt(out,'data-dam-slot') + ' block=' + cnt(out,'data-dam-block') + ' MEMORY_TABS()=' + cnt(out,'MEMORY_TABS()'))
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8'))
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r7-' + Date.now())
writeFileSync(SRC, out, 'utf8')
console.log('已写盘（含备份）')