/**
 * B 部分（宿主 index.js）：无 sessionId 时不跨工作区乱猜。
 *
 * ★本次踩坑记录：首个脚本把 B1 的「旧写法已消失」判据写成 `!ix.includes('|| this.recentSessionIdFallback()')`，
 *   而**替换文本自己的注释里就引用了 `this.currentSessionId() || this.recentSessionIdFallback()`**
 *   ⇒ 断言自命中、误报「旧写法仍在」，index.js 因此没落盘（client.js 已落）。
 *   本条复用记忆里的纪律：幂等/消失判据**不得**用裸 includes 判字符串，必须只判**代码行**（正则锚定到 `const sid = ...`）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const IDX = 'D:/dsh-auto-memory/lib/index.js'
const ok = (c, m) => { if (!c) throw new Error('断言失败: ' + m) }
const N = (s, sub) => s.split(sub).length - 1

let ix = readFileSync(IDX, 'utf8')
const ic0 = (ix.match(/\r\n/g) || []).length
const il0 = (ix.match(/\n/g) || []).length
ok(il0 === ic0, 'index.js 原本不是纯 CRLF')

const RE_CODE_OLD = /const sid = this\.currentSessionId\(\) \|\| this\.recentSessionIdFallback\(\)/
const RE_CODE_NEW = /const sid = String\(sessionId \|\| ""\) \|\| this\.currentSessionId\(\)/

if (RE_CODE_NEW.test(ix)) {
  console.log('index.js: B1 已是新写法，跳过（幂等）')
} else {
  const B1 = [
    '    // 刷新仪式的会话 id:内存态为空时走磁盘回退(宿主重启后 _lastAgent 未重建的窗口期)',
    '    const sid = this.currentSessionId() || this.recentSessionIdFallback()',
  ].join('\r\n')
  ok(N(ix, B1) === 1, 'B1 锚点不是恰 1 次')
  ok(RE_CODE_OLD.test(ix), '旧代码行不在（快照与预期不符）')
  ix = ix.replace(B1, [
    '    // 刷新仪式的会话 id(★2026-09-28 收紧)。',
    '    //   旧实现取 `currentSessionId()` 失败后会做**跨所有工作区**的磁盘回退：扫 ~/.dsh/sessions/ 取全局',
    '    //   最新 mtime，却只返回一个裸 sessionId、不含工作区 ⇒ 用户手动点「一键接续」时极可能把**别的工作区**',
    '    //   的会话当成刷新目标（实测症状：自动接续正常，手动接续漂到别的工作区）。',
    '    //   现改为：**带了 sessionId 就用它**（调用方最清楚自己在续哪个会话）；没带才退回内存态全局值，',
    '    //   且**不再做跨工作区磁盘回退** —— 拿不到宁可返回空串，让客户端如实报「未给出旧会话 id」，',
    '    //   而不是悄悄刷到别人的会话。',
    '    const sid = String(sessionId || "") || this.currentSessionId()',
  ].join('\r\n'))
  ok(RE_CODE_NEW.test(ix), '新代码行未写入')
  ok(!RE_CODE_OLD.test(ix), '旧代码行仍在')
  ok(N(ix, 'recentSessionIdFallback() {') === 1, 'recentSessionIdFallback 定义被误伤')
  const ic1 = (ix.match(/\r\n/g) || []).length
  const il1 = (ix.match(/\n/g) || []).length
  ok(il1 === ic1, 'index.js 写入后出现裸 LF: ' + (il1 - ic1))
  writeFileSync(IDX, ix)
  console.log('index.js: B1 已落 | CRLF ' + ic0 + ' -> ' + ic1 + ' / 裸LF ' + (il1 - ic1))
}
