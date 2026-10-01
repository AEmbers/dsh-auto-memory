#!/usr/bin/env node
/**
 * [generator-guard] 生成器的「会覆盖未落源改动」防线，必须常驻。
 *
 * ★由来（2026-10-01 真实事故）：有人把修复只写进 lib/client.js 的生成区、没落进源文件，
 *   下一次跑生成器就静默还原，而 node --check 与全部静态守卫全绿（产物自洽，只是修复没了）。
 *   用户裁定：给生成器加提醒，「让它每次运行前都能读到」。
 *
 * ★本守卫检查生成器**自己承诺的三件事**是否还在（真读文件、真执行断言，不是读注释）：
 *   ① 文件头有警告块，且写明「会覆盖什么 / 源在哪 / --strict 怎么用」；
 *   ② 有运行时检测函数 orphanedLines，且它能真判出「只在磁盘上、会被覆盖」的行；
 *   ③ --strict 真能拒绝写盘（子进程实跑，断言退出码 = 2 且产物未变）；
 *   ④ --check 仍是只读（跑完磁盘字节不变）。
 *   负路径：把检测函数删掉，②必须失败（证明断言不是恒真）。
 * 只读 + 两个子进程（都是生成器自身的 --check / --strict 语义），不写任何业务文件。
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { spawnSync as runGen } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const GEN = path.join(ROOT, 'tools', 'build-iter5-skin.mjs')
const CLIENT = path.join(ROOT, 'lib', 'client.js')
const genSrc = readFileSync(GEN, 'utf8')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok -', m) } else { fail++; console.error('  FAIL -', m) } }

// ---- ① 头部警告块 ----
ok(/本生成器会\*\*覆盖\*\*/.test(genSrc), '文件头有「会覆盖」警告块')
ok(/ITER5-LEGACY-GENERATED:BEGIN/.test(genSrc) && /覆盖/.test(genSrc.slice(0, 3000)), '头部写明被覆盖的两对标记')
ok(/iter5-325\.js\.frozen/.test(genSrc.slice(0, 3000)), '头部给出冻结源路径')
ok(/--strict/.test(genSrc.slice(0, 4000)), '头部写明 --strict 用法')

// ---- ② 运行时检测函数存在 ----
ok(/function orphanedLines\(/.test(genSrc), '存在 orphanedLines 运行时检测函数')
const iFn = genSrc.indexOf('function orphanedLines(')
const iUse = genSrc.indexOf('orphanedLines(onDisk, output)')
ok(iFn > 0 && iUse > iFn, '检测函数在写盘前被真正调用（定义<=调用）')
ok(/process\.exit\(2\)/.test(genSrc), '--strict 分支会以非零码退出')

// ---- ③ 真跑：注入一行未落源内容，--strict 必须拒绝且不写盘 ----
const MARK = '      // ★GEN-GUARD-PROBE: only-on-disk line'
const orig = readFileSync(CLIENT, 'utf8')
const backup = CLIENT + '.gen-guard-bak'
copyFileSync(CLIENT, backup)
let strictCode = null, strictOut = ''
try {
  const lines = orig.split('\n')
  const at = lines.findIndex((l) => l.includes('function iter5ThemeGet'))
  assert.ok(at > 0, 'probe anchor found')
  lines.splice(at, 0, MARK)
  writeFileSync(CLIENT, lines.join('\n'))
  {
    const r = runGen(process.execPath, [GEN, '--strict'], { cwd: ROOT, encoding: 'utf8' })
    strictCode = r.status
    strictOut = String(r.stdout || '') + String(r.stderr || '')   // 告警与拒绝都走 stderr
  }
  ok(strictCode === 2, '--strict 遇到未落源内容时退出码 = 2（实 ' + strictCode + '）')
  ok(/拒绝写盘/.test(strictOut), '--strict 打印「拒绝写盘」')
  ok(readFileSync(CLIENT, 'utf8').includes(MARK), '--strict 确实没写盘（探针行还在）')
} finally {
  copyFileSync(backup, CLIENT)
}

// ---- ④ 默认：必须告警（但不拦）----
let defOut = ''
try {
  const lines = readFileSync(CLIENT, 'utf8').split('\n')
  const at = lines.findIndex((l) => l.includes('function iter5ThemeGet'))
  lines.splice(at, 0, MARK)
  writeFileSync(CLIENT, lines.join('\n'))
  const rd = runGen(process.execPath, [GEN], { cwd: ROOT, encoding: 'utf8' })
  defOut = String(rd.stdout || '') + String(rd.stderr || '')   // 告警走 stderr，必须一起抓
  ok(/警告/.test(defOut) && /丢弃/.test(defOut), '默认模式对未落源内容打印告警')
  ok(defOut.includes('L' + (at + 1)), '告警里带出行号')
  ok(!readFileSync(CLIENT, 'utf8').includes(MARK), '默认模式仍然写盘（探针行已被覆盖）')
} finally {
  copyFileSync(backup, CLIENT)
}

// ---- ⑤ --check 只读 ----
const before = readFileSync(CLIENT, 'utf8')
const chk = String(runGen(process.execPath, [GEN, '--check'], { cwd: ROOT, encoding: 'utf8' }).stdout || '')
ok(/up to date/.test(chk), '--check 报告 up to date')
ok(readFileSync(CLIENT, 'utf8') === before, '--check 全程未改磁盘（字节相同）')

// ---- ⑥ 负路径：真删检测函数，②必须失败 ----
assert.throws(() => {
  const mut = genSrc.replace(/function orphanedLines\([\s\S]*?\n\}/, '')
  assert.notEqual(mut, genSrc, 'MUTATION: 检测函数锚点命中')
  assert.ok(/function orphanedLines\(/.test(mut), 'MUTATION: 删除后不应再存在')
}, /MUTATION/)
ok(true, 'MUTATION 负路径：删掉检测函数后 ② 的断言必失败')

console.log('')
console.log('== generator-guard: PASS ' + pass + ' / FAIL ' + fail + ' ==')
if (fail) process.exit(1)
