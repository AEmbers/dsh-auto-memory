#!/usr/bin/env node
// B12 R10a 扩配置契约：layout-config.js 新增 blocks 段（按 blockKind 配置块外观与背景图）。
// 依据 28 卷 §3.4（10 类 kind 取值受控）/§3.5 方式 C（--dam-block-style 消费点）/§3.6（authorSurface.imagery）。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'lib', 'layout-config.js')
const SNIP = (n) => readFileSync(join(ROOT, 'tools', 'snippets', n), 'utf8').replace(/\r?\n/g, '\r\n').replace(/\r\n$/, '')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + (raw.match(/\r\n/g) || []).length)

// 锚① 原样返回块（含 return { ... hidden: [], } ）——用起锚 + 段内终点锚（不得借用邻接物）
const A1 = [
  '  const slots = {}',
  '  for (let i = 0; i < LAYOUT_SLOTS.length; i++) {',
  '    slots[LAYOUT_SLOTS[i]] = { }',
  '  }',
  '  return {',
  '    version: LAYOUT_CONFIG_VERSION,',
  '    regions: regions,',
  '    slots: slots,',
  '    tokens: {},',
  '    hidden: [],',
  '  }',
].join('\r\n')
const A2 = '  // ---------- hidden:便捷数组写法(等价于 region/slot.hidden=true) ----------'
const S1 = SNIP('r10-default.txt')
const S2 = SNIP('r10-normalize.txt')

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
chk('锚① defaultLayoutConfig 返回块唯一（=1，实测 ' + (raw.split(A1).length - 1) + '）', raw.split(A1).length - 1 === 1)
chk('锚② hidden 段注释唯一（=1，实测 ' + (raw.split(A2).length - 1) + '）', raw.split(A2).length - 1 === 1)
chk('锚③ 基线无 blocks（=0，实测 ' + (raw.split('blocks').length - 1) + '）', (raw.split('blocks').length - 1) === 0)
if (bad) { console.error('锚点校验失败 ' + bad + ' 条，拒绝继续'); process.exit(1) }

let out = raw
out = out.replace(A1, S1)
out = out.replace(A2, S2)

const crlf0 = (raw.match(/\r\n/g) || []).length, crlf1 = (out.match(/\r\n/g) || []).length
const addLines = (S1.split('\r\n').length - 11) + (S2.split('\r\n').length - 1)
bad = 0
chk('① CRLF 增量 = 插入净行数（+' + (crlf1 - crlf0) + ' / 期望 +' + addLines + '）', crlf1 - crlf0 === addLines)
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
const cntOf = (s, k) => s.split(k).length - 1
const expBlocks = cntOf(raw, 'blocks') + cntOf(S1, 'blocks') + cntOf(S2, 'blocks')
const expKinds = cntOf(raw, 'LAYOUT_BLOCK_KINDS') + cntOf(S1, 'LAYOUT_BLOCK_KINDS') + cntOf(S2, 'LAYOUT_BLOCK_KINDS')
console.log('  基线 blocks = ' + cntOf(raw, 'blocks') + ' | 片段贡献 = ' + (cntOf(S1, 'blocks') + cntOf(S2, 'blocks')) + ' ⇒ 期望 ' + expBlocks)
console.log('  基线 LAYOUT_BLOCK_KINDS = ' + cntOf(raw, 'LAYOUT_BLOCK_KINDS') + ' | 片段贡献 = ' + (cntOf(S1, 'LAYOUT_BLOCK_KINDS') + cntOf(S2, 'LAYOUT_BLOCK_KINDS')) + ' ⇒ 期望 ' + expKinds)
chk('③ blocks 出现次数 = ' + expBlocks + '（实测 ' + cntOf(out, 'blocks') + '）', cntOf(out, 'blocks') === expBlocks)
chk('④ LAYOUT_BLOCK_KINDS 出现次数 = ' + expKinds + '（实测 ' + cntOf(out, 'LAYOUT_BLOCK_KINDS') + '）', cntOf(out, 'LAYOUT_BLOCK_KINDS') === expKinds)
// ★防御断言（本轮实测教训）：替换块必须完整保留原块尾部，否则对象字面量被截断
const tailLines = ['    tokens: {},', '    hidden: [],', '  }']
chk('⑦ S1 完整保留原 return 块尾部 3 行', tailLines.every((l) => S1.indexOf(l) >= 0))
chk('⑧ S1 行数 = 原块 11 行 + 净增 5 = 16（实测 ' + S1.split('\r\n').length + '）', S1.split('\r\n').length === 16)
chk('⑨ S1 保留 slots 定义与循环（未被吞掉）', S1.indexOf('  const slots = {}') >= 0 && S1.indexOf('    slots[LAYOUT_SLOTS[i]] = { }') >= 0)
chk('⑤ 既有 4 个 export 函数各 1 次（不降级）',
  (out.split('export function defaultLayoutConfig').length - 1) === 1 &&
  (out.split('export function normalizeLayoutConfig').length - 1) === 1)
chk('⑥ regions/slots/tokens/hidden 四段解析块均保留',
  out.indexOf('---------- regions ----------') > 0 && out.indexOf('---------- slots ----------') > 0 &&
  out.indexOf('---------- tokens') > 0 && out.indexOf('---------- hidden') > 0)
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'))
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r10a-' + Date.now())
writeFileSync(SRC, out, 'utf8')
console.log('已写盘（含备份）')