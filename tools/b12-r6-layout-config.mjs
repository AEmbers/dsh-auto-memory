#!/usr/bin/env node
// B12 R6 配置层接线：宿主读 layout-config.json 并入既有 state 路由（不新增路由）。
// ★插入文本从 tools/snippets/*.txt 读取（CRLF）——避免 JS 字符串转义地狱。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'lib', 'index.js')
const SNIP = (n) => readFileSync(join(ROOT, 'tools', 'snippets', n), 'utf8').replace(/\r?\n/g, '\r\n').replace(/\r\n$/, '')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8'))

const A1 = "import { writeTextAtomicPreSync, writeTextAtomicPre, readJsonQuarantinePreSync } from './config-io.js'"
const A2 = 'function dshHome() {'
const A3 = '          writeJson(res, 200, await engine.snapshot())'
const S1 = SNIP('r6-import.txt')
const S2 = SNIP('r6-fn.txt')
const S3 = SNIP('r6-route.txt')

let bad = 0
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ }
const cnt = (s, k) => s.split(k).length - 1
chk('锚① import 行唯一（=1，实测 ' + cnt(raw, A1) + '）', cnt(raw, A1) === 1)
chk('锚② dshHome 定义唯一（=1，实测 ' + cnt(raw, A2) + '）', cnt(raw, A2) === 1)
chk('锚③ state 快照行唯一（=1，实测 ' + cnt(raw, A3) + '）', cnt(raw, A3) === 1)
chk('锚④ 尚未接线（layoutConfig: = 0）', cnt(raw, 'layoutConfig:') === 0)
chk('锚⑤ 尚未导入 layout-config（=0）', cnt(raw, "from './layout-config.js'") === 0)
const route0 = cnt(raw, "kind: 'exact'")
console.log('  基线路由数 = ' + route0)
if (bad) { console.error('锚点校验失败 ' + bad + ' 条'); process.exit(1) }

let out = raw.replace(A1, A1 + '\r\n' + S1)
out = out.replace(A2, S2 + '\r\n' + A2)
out = out.replace(A3, S3)

const crlf0 = (raw.match(/\r\n/g) || []).length, crlf1 = (out.match(/\r\n/g) || []).length
bad = 0
chk('① CRLF 增量 = 插入行数（+' + (crlf1 - crlf0) + '）', crlf1 - crlf0 === (S1.split('\r\n').length + S2.split('\r\n').length + S3.split('\r\n').length - 1))
chk('② 裸 LF = 0', !/(^|[^\r])\n/.test(out))
chk('③ 路由数不变（' + route0 + '）', cnt(out, "kind: 'exact'") === route0)
chk('④ API.state 引用数不变', cnt(out, 'API.state') === cnt(raw, 'API.state'))
chk('⑤ layout-config 导入恰 1 次', cnt(out, "from './layout-config.js'") === 1)
chk('⑥ readLayoutConfigPre 定义恰 1 次 + 调用恰 1 次', cnt(out, 'function readLayoutConfigPre()') === 1 && cnt(out, 'readLayoutConfigPre()') === 2)
chk('⑦ 新增字段 layoutConfig 恰 1 次', cnt(out, 'layoutConfig:') === 1)
console.log('B1 = ' + sha16(out) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'))
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r6-' + Date.now())
writeFileSync(SRC, out, 'utf8')
console.log('已写盘（含备份）')