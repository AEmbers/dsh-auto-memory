#!/usr/bin/env node
/** 外观层残余扫描器（CLI 外壳；度量实现在 tools/lib/appearance-scan.mjs，与套件同源）。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanAppearance, scanAppearanceDetail } from './lib/appearance-scan.mjs'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILES = ['lib/client.js', 'lib/index.js', 'lib/layout-config.js']
const report = {}
let g = { hex: 0, rgba: 0 }
for (const rel of FILES) {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const sum = scanAppearance(src)
  const det = scanAppearanceDetail(src)
  report[rel] = { sum, det }
  g.hex += sum.hex; g.rgba += sum.rgba
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 1)); process.exit(0) }
console.log('=== 外观层残余（定义行外的「真·无 token 承接裸值」）===');
for (const [f, r] of Object.entries(report)) {
  const s = r.sum;
  const grp = (arr) => { const m = {}; for (const x of arr) (m[x.value] = m[x.value] || []).push(x.line); return m };
  const gh = grp(r.det.hex), gr = grp(r.det.rgba);
  console.log('\n' + f);
  console.log('  裸 hex ：' + s.hex + '（' + Object.keys(gh).length + ' 种）｜ 定义行内 ' + s.hexInDef + '（定义本身）');
  console.log('  裸 rgba：' + s.rgba + '（' + Object.keys(gr).length + ' 种）｜ 定义行内 ' + s.rgbaInDef);
  for (const [v, ls] of Object.entries(gh).sort((a, b) => b[1].length - a[1].length)) console.log('    ' + v.padEnd(11) + ' ×' + String(ls.length).padStart(3) + '  L' + ls.slice(0, 6).join(','));
}
console.log('\n=== 汇总 ===');
console.log('真·裸 hex  = ' + g.hex);
console.log('真·裸 rgba = ' + g.rgba);
console.log('目标：两者均归零');