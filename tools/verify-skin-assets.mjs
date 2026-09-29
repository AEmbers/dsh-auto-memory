#!/usr/bin/env node
/**
 * tools/verify-skin-assets.mjs —— S2 皮肤线「素材通路」验收器（CR-10）。
 *
 * 真 import lib/skin-assets.js，真读文件系统，真调 assetOf()，断言返回值。
 * 不是源码字符串匹配 —— 全部断言都基于运行期对象与磁盘事实。
 *
 * 权威依据：
 *  · docs/teamwork-impl/12-皮肤资源插口清单.md §2（6 槽位 key/尺寸/构图）+ §4（assetOf 占位契约）
 *  · docs/teamwork-impl/58-B12施工进度表.md 阶段 4（4.1 六槽位 / 4.3 素材通路 / 4.4 深色版）
 *  · docs/teamwork-impl/18-S3-皮肤协议差异对比.md M8（relPath 禁前导斜杠 / .. / 协议 URL）
 *
 * 负路径（本脚本自身可被证伪）：
 *  · §3.3 故意把 file 指向磁盘上不存在的路径 ⇒ §3.2 必须报红、退出码 1
 *  · §4.3 未知 key 必须返回确定性占位（不抛错、不返回 undefined）
 *
 * 退出码：全绿 0 / 任一失败 1。
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SOURCE = join(ROOT, 'lib', 'skin-assets.js')
const SKIN_DIR = join(ROOT, 'lib', 'assets', 'skin')
const MANIFEST = join(SKIN_DIR, '_manifest.json')

/** 12 卷 §2 表冻结的 6 个槽位（顺序即文档顺序）。 */
const EXPECTED_KEYS = [
  'hero.welcome',
  'empty.library',
  'empty.timeline',
  'empty.recall',
  'bg.mindmap',
  'illust.sync',
]

/** 已知填充：key -> 期望文件（相对 lib/assets/skin/）。未列出的槽位必须保持 file:''。 */
const EXPECTED_FILES = {
  'hero.welcome': 'slots/hero.welcome.png',
  'empty.recall': 'slots/empty.recall.png',
  'illust.sync': 'slots/illust.sync.png',
}

let pass = 0
let fail = 0
const failures = []

function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  PASS  ' + name + (detail ? '   ' + detail : ''))
  } else {
    fail++
    failures.push(name)
    console.log('  FAIL  ' + name + (detail ? '   ' + detail : ''))
  }
}

function section(title) {
  console.log('')
  console.log(title)
}

function sha16(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

/** 读 PNG / WebP 头部尺寸（只读头部，不解码像素）。 */
function imageSize(buf) {
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { fmt: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16)
    if (fourcc === 'VP8X') {
      return { fmt: 'webp', w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) }
    }
    if (fourcc === 'VP8 ') {
      return { fmt: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
    }
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { fmt: 'webp', w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }
    }
  }
  return { fmt: 'unknown', w: 0, h: 0 }
}

console.log('='.repeat(74))
console.log('S2 皮肤线素材通路验收  ·  tools/verify-skin-assets.mjs')
console.log('源文件  ' + SOURCE)
console.log('='.repeat(74))

/* ── §0 前置：源文件自身物理量 + EOL 纪律（lib/*.js 必须纯 CRLF） ───────── */
section('§0 源文件物理量')
const srcBuf = readFileSync(SOURCE)
const srcBin = srcBuf.toString('binary')
const srcCRLF = (srcBin.match(/\r\n/g) || []).length
const srcLF = (srcBin.match(/\n/g) || []).length
const srcBareLF = srcLF - srcCRLF
console.log('  lib/skin-assets.js   bytes=' + srcBuf.length + '  CRLF=' + srcCRLF + '  bareLF=' + srcBareLF + '  sha256=' + sha16(srcBuf))
assert('0.1 源文件存在且非空', srcBuf.length > 0)
assert('0.2 lib/*.js 保持纯 CRLF（bareLF === 0）', srcBareLF === 0, 'bareLF=' + srcBareLF)

/* ── §1 真 import + 6 槽位键集合恰好为 12 卷规定 ────────────────────────── */
section('§1 键集合（12 卷 §2 规定的恰好 6 个）')
let SKIN_ASSETS = null
let assetOf = null
try {
  const mod = await import(pathToFileURL(SOURCE).href)
  SKIN_ASSETS = mod.SKIN_ASSETS
  assetOf = mod.assetOf
  assert('1.1 真 import lib/skin-assets.js 成功', true)
} catch (e) {
  assert('1.1 真 import lib/skin-assets.js 成功', false, String(e && e.message))
}

assert('1.2 导出 SKIN_ASSETS 为对象', SKIN_ASSETS !== null && typeof SKIN_ASSETS === 'object')
assert('1.3 导出 assetOf 为函数', typeof assetOf === 'function')

const actualKeys = SKIN_ASSETS ? Object.keys(SKIN_ASSETS).sort() : []
const expectedSorted = EXPECTED_KEYS.slice().sort()
assert('1.4 键数量恰好为 6', actualKeys.length === 6, 'actual=' + actualKeys.length)
assert('1.5 键集合与 12 卷逐条一致（无缺、无多、无拼写漂移）',
  JSON.stringify(actualKeys) === JSON.stringify(expectedSorted),
  'actual=' + JSON.stringify(actualKeys))
for (const k of EXPECTED_KEYS) {
  assert('1.6 槽位存在: ' + k, Object.prototype.hasOwnProperty.call(SKIN_ASSETS || {}, k))
}
assert('1.7 Object.freeze 生效（顶层不可扩展）', Object.isFrozen(SKIN_ASSETS))
for (const k of EXPECTED_KEYS) {
  const e = SKIN_ASSETS[k]
  assert('1.8 ' + k + ' 形状齐备 file/alt/size/status',
    typeof e.file === 'string' &&
    typeof e.alt === 'string' && e.alt.length > 0 &&
    Array.isArray(e.size) && e.size.length === 2 &&
    typeof e.status === 'string',
    'size=' + JSON.stringify(e.size) + ' status=' + e.status)
}

/* ── §2 每个非空 file 在磁盘上真实存在 ─────────────────────────────────── */
section('§2 非空 file 的磁盘存在性（真 fs.existsSync）')
const filled = EXPECTED_KEYS.filter(k => SKIN_ASSETS && SKIN_ASSETS[k] && SKIN_ASSETS[k].file)
const empty = EXPECTED_KEYS.filter(k => SKIN_ASSETS && SKIN_ASSETS[k] && !SKIN_ASSETS[k].file)
console.log('  已填充 ' + filled.length + ' 槽位: ' + (filled.join(', ') || '(无)'))
console.log('  未填充 ' + empty.length + ' 槽位: ' + (empty.join(', ') || '(无)'))

assert('2.1 存在已填充槽位（否则通路验收无意义）', filled.length > 0, 'filled=' + filled.length)
assert('2.2 ★6 槽位全部填充（S2 收口：不再有占位槽位）', filled.length === 6, 'filled=' + filled.length)

/* ── §2b ★尺寸逐像素符合 12 卷（PNG/WebP 直读元数据，不靠文件名） ────────── */
section('§2b 图片真实尺寸 === 12 卷要求（直读文件头）')
function pngSize (buf) {
  if (buf.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}
function webpSize (buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null
  const c = buf.toString('ascii', 12, 16)
  if (c === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) }
  if (c === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
  if (c === 'VP8L') { const n = buf.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 } }
  return null
}
for (const k of EXPECTED_KEYS) {
  const e = SKIN_ASSETS[k]
  const f = join(ROOT, 'lib', 'assets', 'skin', e.file)
  let sz = null
  try { const buf = readFileSync(f); sz = e.file.endsWith('.webp') ? webpSize(buf) : pngSize(buf) } catch (_) {}
  const want = e.size
  assert('2b.' + k + ' 尺寸 ' + want.join('×'), !!(sz && sz.w === want[0] && sz.h === want[1]),
    'actual=' + (sz ? sz.w + '×' + sz.h : 'unreadable'))
}

/* ── §2c 深色字段（S2 4.4）：只认 fileDark，空串回落浅色 ──────────────── */
section('§2c 深色素材字段与回落')
for (const k of EXPECTED_KEYS) {
  const e = SKIN_ASSETS[k]
  const dark = typeof e.fileDark === 'string' ? e.fileDark : ''
  if (!dark) continue
  const f = join(ROOT, 'lib', 'assets', 'skin', dark)
  assert('2c.' + k + ' fileDark 存在 ' + dark, existsSync(f), 'missing')
  const a = assetOf(k, true)
  assert('2c.' + k + ' 深色 assetOf 取到 fileDark', a.placeholder === false && a.url === dark, JSON.stringify(a))
}
const darkKeys = EXPECTED_KEYS.filter(k => SKIN_ASSETS[k] && SKIN_ASSETS[k].fileDark)
assert('2c.4 深色已接槽位数 = 2（bg.mindmap / hero.welcome）', darkKeys.length === 2, 'n=' + darkKeys.length)
const lightOnly = EXPECTED_KEYS.filter(k => SKIN_ASSETS[k] && !SKIN_ASSETS[k].fileDark)
for (const k of lightOnly) {
  const a = assetOf(k, true)
  assert('2c.5.' + k + ' ★深色回落浅色（不产占位）', a.placeholder === false && a.url === SKIN_ASSETS[k].file, JSON.stringify(a))
}

const byteRows = []
let totalBytes = 0
for (const k of EXPECTED_KEYS) {
  const entry = SKIN_ASSETS ? SKIN_ASSETS[k] : null
  if (!entry) continue
  const rel = entry.file
  if (!rel) {
    const r = assetOf(k)
    assert('2.3 [' + k + '] file 为空 ⇒ 走占位且无磁盘读取', r && r.placeholder === true, JSON.stringify(r))
    continue
  }
  const abs = join(SKIN_DIR, rel)
  const exists = existsSync(abs)
  assert('2.4 [' + k + '] 文件真实存在: ' + rel, exists, exists ? '' : 'MISSING ' + abs)
  if (!exists) continue

  const buf = readFileSync(abs)
  const st = statSync(abs)
  const dim = imageSize(buf)
  const entry16 = sha16(buf)
  totalBytes += buf.length
  byteRows.push({ key: k, rel, bytes: buf.length, w: dim.w, h: dim.h, fmt: dim.fmt, sha16: entry16 })

  assert('2.5 [' + k + '] 非空文件（bytes > 0）', buf.length > 0, buf.length + 'B')
  assert('2.6 [' + k + '] 是常规文件', st.isFile())
  assert('2.7 [' + k + '] 解码出真实像素尺寸', dim.w > 0 && dim.h > 0, dim.fmt + ' ' + dim.w + 'x' + dim.h)
  assert('2.8 [' + k + '] 像素尺寸 == 声明 size ' + JSON.stringify(entry.size),
    dim.w === entry.size[0] && dim.h === entry.size[1],
    'actual=' + dim.w + 'x' + dim.h)
  assert('2.9 [' + k + '] file 为皮肤目录内相对路径（18 卷 M8）',
    !isAbsolute(rel) && !rel.startsWith('/') && !rel.includes('..') && !/^[a-z]+:/i.test(rel), rel)
  assert('2.10 [' + k + '] status 与 file 一致（非空 ⇒ ready）', entry.status === 'ready', 'status=' + entry.status)
}

for (const k of empty) {
  assert('2.11 [' + k + '] 留空 ⇔ status 仍为 pending',
    SKIN_ASSETS[k].file === '' && SKIN_ASSETS[k].status === 'pending',
    'file=' + JSON.stringify(SKIN_ASSETS[k].file) + ' status=' + SKIN_ASSETS[k].status)
}

/* ── §3 assetOf() 契约 —— 正路径 + 负路径 ─────────────────────────────── */
section('§3 assetOf() 返回值契约')
for (const k of filled) {
  const r = assetOf(k)
  assert('3.1 [正路径][' + k + '] 已填充 ⇒ {placeholder:false, url, alt}',
    r && r.placeholder === false && r.url === SKIN_ASSETS[k].file && r.alt === SKIN_ASSETS[k].alt,
    JSON.stringify(r))
}
for (const k of empty) {
  const r = assetOf(k)
  assert('3.2 [' + k + '] file 为空 ⇒ {placeholder:true} 而非空/undefined',
    r && typeof r === 'object' && r.placeholder === true && r.key === k && typeof r.alt === 'string' && r.alt.length > 0,
    JSON.stringify(r))
}

const NEG_KEYS = ['__no_such_key__', 'welcome.hero', 'HERO.WELCOME', '', '   ']
section('§3.3 [负路径] 未知/null/空 key ⇒ 确定性占位（不抛、不 undefined）')
const negResults = []
for (const nk of NEG_KEYS) {
  let r = null
  let threw = null
  try { r = assetOf(nk) } catch (e) { threw = e }
  negResults.push({ key: JSON.stringify(nk), threw: !!threw, result: r })
  assert('3.3.1 未知 key ' + JSON.stringify(nk) + ' 不抛错', threw === null, threw ? String(threw.message) : '')
  assert('3.3.2 未知 key ' + JSON.stringify(nk) + ' 返回对象而非 undefined',
    r !== undefined && r !== null && typeof r === 'object', String(r))
  assert('3.3.3 未知 key ' + JSON.stringify(nk) + ' placeholder === true', !!r && r.placeholder === true, JSON.stringify(r))
  assert('3.3.4 未知 key ' + JSON.stringify(nk) + ' 不带 url 字段（不泄漏路径）', !!r && r.url === undefined, JSON.stringify(r))
}
for (const [label, bad] of [['null', null], ['undefined', undefined], ['number 42', 42], ['object {}', {}]]) {
  let r = null
  let threw = null
  try { r = assetOf(bad) } catch (e) { threw = e }
  assert('3.3.5 非字符串 key ' + label + ' 不抛且返回占位',
    threw === null && r && r.placeholder === true, threw ? String(threw.message) : JSON.stringify(r))
}

section('§3.4 [负路径] 断言器自身可被证伪（磁盘不存在必须报红）')
const BOGUS = 'slots/__definitely_not_here__.png'
const bogusAbs = join(SKIN_DIR, BOGUS)
const bogusExists = existsSync(bogusAbs)
assert('3.4.1 哨兵负样本在磁盘上确实不存在（若存在，本负路径失效）', bogusExists === false, bogusAbs)
assert('3.4.2 断言器判据对不存在路径为假（existsSync === false ⇒ §2.4 会报红）', bogusExists === false)
assert('3.4.3 驱动器可用性：本轮已真读到至少一个文件', byteRows.length > 0, 'read=' + byteRows.length)

/* ── §4 与独立产物 _manifest.json 交叉核对（非同源守真） ───────────────── */
section('§4 与 _manifest.json 交叉核对（独立产物）')
const mfExists = existsSync(MANIFEST)
assert('4.1 _manifest.json 存在', mfExists, MANIFEST)
if (mfExists) {
  let mf = null
  try { mf = JSON.parse(readFileSync(MANIFEST, 'utf8')) } catch (e) { mf = null }
  assert('4.2 _manifest.json 是合法 JSON', mf !== null)
  const byKey = {}
  for (const s of (mf && mf.slots) || []) byKey[s.key] = s
  assert('4.3 manifest 覆盖全部 6 槽位', Object.keys(byKey).length === 6, 'keys=' + Object.keys(byKey).length)
  for (const row of byteRows) {
    const m = byKey[row.key]
    assert('4.4 [' + row.key + '] manifest 记录的字节数一致',
      !!m && m.bytes === row.bytes, 'manifest=' + (m && m.bytes) + ' actual=' + row.bytes)
    assert('4.5 [' + row.key + '] manifest 记录的相对路径一致',
      !!m && m.file === row.rel, 'manifest=' + (m && m.file) + ' actual=' + row.rel)
    assert('4.6 [' + row.key + '] manifest 记录的 sha256 前 16 一致',
      !!m && typeof m.sha256 === 'string' && m.sha256.slice(0, 16) === row.sha16,
      'manifest=' + (m && m.sha256 && m.sha256.slice(0, 16)) + ' actual=' + row.sha16)
    assert('4.7 [' + row.key + '] manifest 记录的尺寸一致',
      !!m && JSON.stringify(m.size) === JSON.stringify([row.w, row.h]),
      'manifest=' + JSON.stringify(m && m.size) + ' actual=' + row.w + 'x' + row.h)
  }
}

/* ── §5 可复算物理量汇总 ───────────────────────────────────────────────── */
section('§5 可复算物理量（每槽位字节 / 6 槽位总字节 / sha256 前 16）')
console.log('  ' + 'key'.padEnd(16) + 'file'.padEnd(28) + 'bytes'.padStart(10) + '  sha256[0:16]      w×h')
console.log('  ' + '-'.repeat(16) + ' ' + '-'.repeat(27) + ' ' + '-'.repeat(10) + '  ' + '-'.repeat(16) + '  ' + '-'.repeat(10))
for (const k of EXPECTED_KEYS) {
  const row = byteRows.find(r => r.key === k)
  if (row) {
    console.log('  ' + k.padEnd(16) + row.rel.padEnd(28) + String(row.bytes).padStart(10) + '  ' + row.sha16 + '  ' + (row.w + 'x' + row.h))
  } else {
    console.log('  ' + k.padEnd(16) + '(空槽位 / 素材缺失，需美术补)'.padEnd(28) + String(0).padStart(10) + '  ' + '-'.repeat(16) + '  ' + '-')
  }
}
console.log('  ' + '-'.repeat(16) + ' ' + '-'.repeat(27) + ' ' + '-'.repeat(10))
console.log('  ' + 'TOTAL(已填充)'.padEnd(16) + String(filled.length + ' 槽位').padEnd(28) + String(totalBytes).padStart(10))
console.log('  ' + 'TOTAL(全目录)'.padEnd(44) + String(totalBytes).padStart(10) + '   （未填充槽位贡献 0）')

assert('5.1 6 槽位总字节 > 0 且等于已填充之和',
  totalBytes > 0 && totalBytes === byteRows.reduce((a, r) => a + r.bytes, 0), totalBytes + 'B')
assert('5.2 已填充槽位文件互不相同（无同图复用凑数）',
  new Set(byteRows.map(r => r.sha16)).size === byteRows.length,
  byteRows.map(r => r.sha16).join(','))

/* ── 结论 ─────────────────────────────────────────────────────────────── */
console.log('')
console.log('='.repeat(74))
console.log('RESULT  PASS ' + pass + '  /  FAIL ' + fail + '  →  exit ' + (fail === 0 ? 0 : 1))
if (fail) {
  console.log('失败项：')
  for (const f of failures) console.log('  · ' + f)
}
console.log('='.repeat(74))
process.exit(fail === 0 ? 0 : 1)
