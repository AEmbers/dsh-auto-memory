#!/usr/bin/env node
// B12 R8 配置层对外消费 B：区域尺寸（--dam-region-w/h/min）+ 外观 token（--dam-* / --skin-*）。
// 依据 28 卷 §3.1/§3.6、70 卷 R8。插入文本全部由 tools/snippets/*.txt 承载（CRLF）。
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

const A1 = "    function useTick() { return useReducer(function (x) { return x + 1 }, 0) }"
const A2 = "    exports.inject = ['slots', 'sessions', 'remote', 'remote.session']"
const A3 = "        try { applyLayoutRegionsPre(state && state.layoutConfig) } catch (e) {}"
const S1 = SNIP('r8-fn.txt')
const S2 = SNIP('r8-effect-call.txt')
const S3 = SNIP('r8-exports.txt')

// ★形态判据（R7 固化纪律：禁用裸子串计数）
const anchorCount = (s, k) => s.split("'" + k + "':").length - 1
const lineCount = (s, re) => s.split(/\r?\n/).filter(function (l) { return re.test(l) }).length
const defCount = (s, fn) => s.split('function ' + fn + '(').length - 1
const cssSeg = (s) => { const a = s.indexOf('var CSS = ['); if (a < 0) return ''; const b = s.indexOf('].join(', a); return b > a ? s.slice(a, b) : '' }

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('锚① useTick 定义唯一（=1，实测 ' + (raw.split(A1).length - 1) + '）', raw.split(A1).length - 1 === 1)
chk('锚② exports.inject 唯一（=1，实测 ' + (raw.split(A2).length - 1) + '）', raw.split(A2).length - 1 === 1)
chk('锚③ R7 effect 单行唯一（=1，实测 ' + (raw.split(A3).length - 1) + '）', raw.split(A3).length - 1 === 1)
chk('锚④ 基线无 layoutRegionSizePlanPre（=0）', defCount(raw, 'layoutRegionSizePlanPre') === 0)
chk('锚⑤ 基线无 layoutTokenPlanPre（=0）', defCount(raw, 'layoutTokenPlanPre') === 0)
const ex0 = lineCount(raw, /^\s*exports\._/)
console.log('  基线 exports._ 赋值语句 = ' + ex0 + ' | R7 两函数定义 = ' + defCount(raw, 'layoutRegionPlanPre') + '/' + defCount(raw, 'applyLayoutRegionsPre'));
if (bad) { console.error('锚点校验失败 ' + bad + ' 条，拒绝继续'); process.exit(1) }

let out = raw
out = out.replace(A1, S1 + '\r\n' + A1)
out = out.replace(A3, S2)
out = out.replace(A2, A2 + '\r\n' + S3)

const crlf0 = (raw.match(/\r\n/g) || []).length, crlf1 = (out.match(/\r\n/g) || []).length
const addLines = S1.split('\r\n').length + (S2.split('\r\n').length - 1) + S3.split('\r\n').length
bad = 0
chk('① CRLF 增量 = 插入净行数（+' + (crlf1 - crlf0) + ' / 期望 +' + addLines + '）', crlf1 - crlf0 === addLines)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('③ 新函数各恰定义 1 次（size/token 各 plan+apply）',
  defCount(out, 'layoutRegionSizePlanPre') === 1 && defCount(out, 'applyLayoutRegionSizesPre') === 1 &&
  defCount(out, 'layoutTokenPlanPre') === 1 && defCount(out, 'applyLayoutTokensPre') === 1)
chk('④ R7 两函数仍各 1 次（不降级）', defCount(out, 'layoutRegionPlanPre') === 1 && defCount(out, 'applyLayoutRegionsPre') === 1)
const ex1 = lineCount(out, /^\s*exports\._/)
chk('⑤ exports._ 赋值语句 +4（' + ex0 + '→' + ex1 + '）', ex1 === ex0 + 4)
const rg0 = anchorCount(raw, 'data-dam-region'), rg1 = anchorCount(out, 'data-dam-region')
const sl0 = anchorCount(raw, 'data-dam-slot'), sl1 = anchorCount(out, 'data-dam-slot')
const bl0 = anchorCount(raw, 'data-dam-block'), bl1 = anchorCount(out, 'data-dam-block')
chk('⑥ 属性锚点守恒 region ' + rg0 + '→' + rg1 + ' / slot ' + sl0 + '→' + sl1 + ' / block ' + bl0 + '→' + bl1,
  rg0 === rg1 && sl0 === sl1 && bl0 === bl1 && rg0 === 13 && sl0 === 426 && bl0 === 10)
const mt0 = raw.split('MEMORY_TABS()').length - 1, mt1 = out.split('MEMORY_TABS()').length - 1
chk('⑦ MEMORY_TABS() 计数锁不变（' + mt0 + '→' + mt1 + '）', mt0 === mt1 && mt0 === 3)
const cs0 = cssSeg(raw), cs1 = cssSeg(out)
chk('⑧ CSS 段零改动（长 ' + cs0.length + '→' + cs1.length + '，data-dam 命中不变）',
  cs0.length === cs1.length && cs0 === cs1)
console.log('  region=' + (out.split('data-dam-region').length - 1) + ' slot=' + (out.split('data-dam-slot').length - 1) + ' block=' + (out.split('data-dam-block').length - 1));
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'))
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r8-' + Date.now())
writeFileSync(SRC, out, 'utf8')
console.log('已写盘（含备份）')