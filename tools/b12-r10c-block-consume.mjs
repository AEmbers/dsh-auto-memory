#!/usr/bin/env node
// B12 R10c 结构层消费 B：block 层消费者（--dam-block-style / --dam-block-bg）。
// 依据 28 卷 §3.5 方式 C（--dam-block-style 是唯一需我方配合的契约）/§3.6 authorSurface.imagery。
// ★跨层守卫：实测 10 个 block 节点中 9 个同时带 region/slot ⇒ 本层只写自己 2 个属性，绝不碰 order/display/--dam-region-*。
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
const cnt = (s, k) => s.split(k).length - 1
const lines = raw.split('\r\n')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + cnt(raw, '\r\n') + ' | 行数 ' + lines.length)

// ---- 锚点定位（用行号 + 行内唯一子串，不用裸子串计数）----
const idxOf = (re, label) => { const hits = []; for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) hits.push(i); if (hits.length !== 1) { console.error('锚 ' + label + ' 命中 ' + hits.length + ' 次，拒绝'); process.exit(1) } return hits[0] }
// 锚① applyLayoutSlotsPre 的结束行 `    }`（紧随其后是空行 + function useTick）
let u = -1; for (let i = 0; i < lines.length; i++) if (/^\s{4}function useTick\(\)/.test(lines[i])) u = i;
if (u < 0) { console.error('找不到 useTick'); process.exit(1) }
const anchor1 = u - 2;  // 空行之前的那一行（= applyLayoutSlotsPre 的收尾 }）
console.log('  锚① 行 ' + (anchor1 + 1) + ' = ' + JSON.stringify(lines[anchor1]) + ' | L' + (u + 1) + ' = ' + JSON.stringify(lines[u]).slice(0, 40));
const anchor2 = idxOf(/applyLayoutSlotsPre\(state && state\.layoutConfig\)/, 'effect-slot');
const anchor3 = idxOf(/^\s*exports\._layoutSlotPlanPre = layoutSlotPlanPre\s*$/, 'exports-slot');
console.log('  锚② effect 行 ' + (anchor2 + 1) + ' | 锚③ exports 行 ' + (anchor3 + 1));

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('锚① 是 4 空格缩进的 `}`（applyLayoutSlotsPre 收尾）', /^\s{4}\}\s*$/.test(lines[anchor1]))
chk('锚① 下一行是空行', lines[anchor1 + 1].trim() === '')
chk('锚③ 下一行是 _applyLayoutSlotsPre 赋值', /^\s*exports\._applyLayoutSlotsPre = applyLayoutSlotsPre\s*$/.test(lines[anchor3 + 1]))
chk('基线：无 layoutBlockPlanPre', cnt(raw, 'layoutBlockPlanPre') === 0)
chk('基线：无 --dam-block-style', cnt(raw, '--dam-block-style') === 0)
chk('基线：无 data-dam-kind 选择器', cnt(raw, 'LAYOUT_BLOCK_SEL') === 0)
if (bad) { console.error('基线校验失败 ' + bad); process.exit(1) }

const S1 = SNIP('r10c-fn.txt').split('\r\n');
const S2 = SNIP('r10c-effect.txt');
const S3 = SNIP('r10c-exports.txt').split('\r\n');

const out = lines.slice(0, anchor1 + 1).concat(S1, lines.slice(anchor1 + 1));
// 因为插入了 S1，后续锚点行号要平移 S1.length
const shift = S1.length;
const out2 = out.slice(0, anchor2 + 1 + shift).concat([S2], out.slice(anchor2 + 1 + shift));
const shift2 = shift + 1;
const out3 = out2.slice(0, anchor3 + 1 + shift2).concat(S3, out2.slice(anchor3 + 1 + shift2));
const next = out3.join('\r\n');

bad = 0
const crlf0 = cnt(raw, '\r\n'), crlf1 = cnt(next, '\r\n');
const expLines = S1.length + 1 + S3.length;
chk('① CRLF 增量 = 插入净行数（+' + (crlf1 - crlf0) + ' / 期望 +' + expLines + '）', crlf1 - crlf0 === expLines)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(next))
chk('③ 行数不变式：行数 = ' + lines.length + ' + ' + expLines, next.split('\r\n').length === lines.length + expLines)
chk('④ layoutBlockPlanPre 定义 1 次 + applyLayoutBlocksPre 定义 1 次', cnt(next, 'function layoutBlockPlanPre(') === 1 && cnt(next, 'function applyLayoutBlocksPre(') === 1)
chk('⑤ 新函数各被调用 1 次（effect 内）', cnt(next, 'applyLayoutBlocksPre(state && state.layoutConfig)') === 1)
chk('⑥ exports 新 2 行（对象属性形态）', cnt(next, 'exports._layoutBlockPlanPre = layoutBlockPlanPre') === 1 && cnt(next, 'exports._applyLayoutBlocksPre = applyLayoutBlocksPre') === 1)
chk('⑦ R7/R8/R9 既有 exports 不降级（各 1 次）',
  cnt(next, 'exports._layoutSlotPlanPre = layoutSlotPlanPre') === 1 &&
  cnt(next, 'exports._applyLayoutSlotsPre = applyLayoutSlotsPre') === 1 &&
  cnt(next, 'exports._layoutRegionPlanPre = layoutRegionPlanPre') === 1 &&
  cnt(next, 'exports._applyLayoutRegionsPre = applyLayoutRegionsPre') === 1 &&
  cnt(next, 'exports._layoutRegionSizePlanPre = layoutRegionSizePlanPre') === 1 &&
  cnt(next, 'exports._layoutTokenPlanPre = layoutTokenPlanPre') === 1)
const rg = (s) => cnt(s, "'data-dam-region':");
const sl = (s) => cnt(s, "'data-dam-slot':");
const bl = (s) => cnt(s, "'data-dam-block':");
const kd = (s) => cnt(s, "'data-dam-kind':");
chk('⑧ 四类 DOM 锚点守恒（region/slot/block/kind = ' + rg(next) + '/' + sl(next) + '/' + bl(next) + '/' + kd(next) + '，期望 ' + rg(raw) + '/' + sl(raw) + '/' + bl(raw) + '/' + kd(raw) + '）',
  rg(next) === rg(raw) && sl(next) === sl(raw) && bl(next) === bl(raw) && kd(next) === kd(raw))
const css = (s) => { const a = s.indexOf('var CSS = ['); const b = s.indexOf('].join(', a); return (a >= 0 && b > a) ? s.slice(a, b) : '' };
chk('⑨ CSS 段逐字节零改动（长 ' + css(raw).length + '→' + css(next).length + '）', css(raw) === css(next) && css(raw).length > 0)
chk('⑩ MEMORY_TABS() 计数锁不变（' + cnt(raw, 'MEMORY_TABS()') + '→' + cnt(next, 'MEMORY_TABS()') + '）', cnt(next, 'MEMORY_TABS()') === cnt(raw, 'MEMORY_TABS()'))
// ★跨层守卫：本层只写自己的两个属性
// ★形态判据（R7 教训）：守卫只看**代码行**，排除注释行，否则注释里的词会污染计数
const codeLines = S1.filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
const codeBody = codeLines.join('\r\n');
chk('⑪ ★跨层守卫：代码行不出现 .style.order / .style.display / --dam-region',
  codeBody.indexOf('.style.order') < 0 && codeBody.indexOf('.style.display') < 0 && codeBody.indexOf('--dam-region') < 0)
chk('⑫ 只写 --dam-block-style / --dam-block-bg 两个属性（代码行各 2 次）',
  cnt(codeBody, '--dam-block-style') === 2 && cnt(codeBody, '--dam-block-bg') === 2)
chk('⑬ 无残留占位符问号', codeBody.indexOf('\u300c') < 0 && codeBody.indexOf('\u300d') < 0)
console.log('B1 = ' + sha16(next) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(next, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r10c-' + Date.now());
writeFileSync(SRC, next, 'utf8');
console.log('已写盘（含备份）');