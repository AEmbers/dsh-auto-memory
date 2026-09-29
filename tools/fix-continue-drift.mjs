/**
 * 修「一键接续」漂到别的工作区（2026-09-28 用户报告）。
 *
 * 现象：自动接续（水位到点）正常；**手动点「一键接续」会新建会话并发到别的工作区**。
 *
 * 根因（两处耦合，均有代码证据）：
 *  缺陷1 宿主 handoffPanelData 的 refresh 目标取**全局**值：
 *        `const sid = this.currentSessionId() || this.recentSessionIdFallback()`
 *        · currentSessionId() 读 this._lastAgent（单进程一份，restoreLastAgent 写）
 *        · recentSessionIdFallback() 跨 ~/.dsh/sessions/ **全部工作区**扫全局最新 mtime，
 *          只返回裸 sessionId、不含工作区 ⇒ 可能给出**别的工作区**的会话。
 *  缺陷2 客户端 refreshOldSession / waitForRefresh 调 handoffState **不带 sessionId**，
 *        拿到 rf.sessionId 后写进 lastRefreshSessionId，随后
 *        `fromSidForCarry = lastRefreshSessionId || currentSessionIdClient()`
 *        —— 那把可疑值排在自己**准确的**会话 id 前面 ⇒ 工作区按它解析 ⇒ 漂移。
 *
 * 修法（最小、解耦）：
 *  A1 刷新仪式按**自己的会话**取数（带 sessionId）。
 *  A2 取回后**严格校核**：仅当 selfSid 非空且 rf.sessionId === selfSid 才采信。
 *  A3 fromSidForCarry 优先序翻转：客户端自己的会话 id 优先。
 *  A4 waitForRefresh 轮询同样带上自己的会话 id（否则比较的是别的工作区的 planMtime/账本）。
 *  B  宿主无 sessionId 时不再跨工作区乱猜。
 *
 * 断言：锚点各恰 1 次；写入后 CRLF 不变、裸 LF 0；新代码存在、旧写法消失。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const CL = 'D:/dsh-auto-memory/lib/client.js'
const IDX = 'D:/dsh-auto-memory/lib/index.js'
const ok = (c, m) => { if (!c) throw new Error('断言失败: ' + m) }
const N = (s, sub) => s.split(sub).length - 1

// ══════════════════════════════════════════════════════════
// A. 客户端
// ══════════════════════════════════════════════════════════
let cj = readFileSync(CL, 'utf8')
const crlf0 = (cj.match(/\r\n/g) || []).length
const lf0 = (cj.match(/\n/g) || []).length
ok(lf0 === crlf0, 'client.js 原本不是纯 CRLF')

// A1. 刷新仪式按自己的会话取数
const A1 = '        var st = await apiGet(API.handoffState)\r\n        var rf = st && st.refresh'
ok(N(cj, A1) === 1, 'A1 锚点不是恰 1 次')
cj = cj.replace(A1, [
  '        // ★2026-09-28 修「一键接续漂到别的工作区」：必须**带自己的会话 id** 去取刷新目标。',
  '        //   不带时宿主会回退到「全局最近活跃会话」(currentSessionId → _lastAgent，甚至跨工作区扫盘)，',
  '        //   于是刷新仪式刷到别人的会话、fromSidForCarry 也拿它当源 ⇒ 新会话落到别的工作区。',
  '        var selfSid = String(currentSessionIdClient() || "")',
  '        var st = await apiGet(API.handoffState, selfSid ? { sessionId: selfSid } : {})',
  '        var rf = st && st.refresh',
].join('\r\n'))

// A2. 严格校核
const A2 = "        lastRefreshSessionId = String(rf.sessionId || '')"
ok(N(cj, A2) === 1, 'A2 锚点不是恰 1 次')
cj = cj.replace(A2, [
  '        // 严格校核(2026-09-28):仅当**本会话 id 非空且与宿主返回的一致**才采信。',
  '        //   旧实现无条件信任 ⇒ 手工接续把「别的会话」当源，新会话漂到别的工作区。',
  '        var rfSid = String(rf.sessionId || "")',
  '        lastRefreshSessionId = (selfSid && rfSid === selfSid) ? rfSid : ""',
].join('\r\n'))

// A3. 优先序翻转
const A3 = "        var fromSidForCarry = String(lastRefreshSessionId || currentSessionIdClient() || '')"
ok(N(cj, A3) === 1, 'A3 锚点不是恰 1 次')
cj = cj.replace(A3, [
  '        // 优先序(2026-09-28):**客户端自己的会话 id 优先**。旧序把它放在回退位，等于让',
  '        //   宿主给的全局值覆盖本地事实 —— 正是漂移的直接通道。lastRefreshSessionId 现已被严格校核，',
  '        //   只在「它确实就是本会话」时才有值。',
  '        var fromSidForCarry = String(currentSessionIdClient() || lastRefreshSessionId || \'\')',
].join('\r\n'))

// A4. waitForRefresh 轮询同样带自己的会话 id
const A4 = '        var st2 = null\r\n        try { st2 = await apiGet(API.handoffState) } catch (eG) {}'
ok(N(cj, A4) === 1, 'A4 锚点不是恰 1 次')
cj = cj.replace(A4, [
  '        var st2 = null',
  '        // ★2026-09-28:这里也必须带 oldId，否则比较的是**别的工作区**的 planMtime/账本，',
  '        //   刷新是否生效会误判(表现为"旧会话未在超时内产出新白板"或反之)。',
  '        try { st2 = await apiGet(API.handoffState, oldId ? { sessionId: oldId } : {}) } catch (eG) {}',
].join('\r\n'))

const crlf1 = (cj.match(/\r\n/g) || []).length
const lf1 = (cj.match(/\n/g) || []).length
ok(lf1 === crlf1, 'client.js 写入后出现裸 LF: ' + (lf1 - crlf1))
ok(cj.includes('var selfSid = String(currentSessionIdClient() || "")'), 'A1 未写入')
ok(cj.includes('lastRefreshSessionId = (selfSid && rfSid === selfSid) ? rfSid : ""'), 'A2 未写入')
ok(cj.includes("var fromSidForCarry = String(currentSessionIdClient() || lastRefreshSessionId || '')"), 'A3 未写入')
ok(cj.includes('apiGet(API.handoffState, oldId ? { sessionId: oldId } : {})'), 'A4 未写入')
ok(!cj.includes('var st = await apiGet(API.handoffState)\r\n'), 'A1 旧写法仍在')
writeFileSync(CL, cj)
console.log('client.js: A1-A4 已落 | CRLF ' + crlf0 + ' -> ' + crlf1 + ' / 裸LF ' + (lf1 - crlf1))

// ══════════════════════════════════════════════════════════
// B. 宿主：无 sessionId 时不跨工作区乱猜
// ══════════════════════════════════════════════════════════
let ix = readFileSync(IDX, 'utf8')
const ic0 = (ix.match(/\r\n/g) || []).length
const il0 = (ix.match(/\n/g) || []).length
ok(il0 === ic0, 'index.js 原本不是纯 CRLF')

const B1 = [
  '    // 刷新仪式的会话 id:内存态为空时走磁盘回退(宿主重启后 _lastAgent 未重建的窗口期)',
  "    const sid = this.currentSessionId() || this.recentSessionIdFallback()",
].join('\r\n')
ok(N(ix, B1) === 1, 'B1 锚点不是恰 1 次')
ix = ix.replace(B1, [
  '    // 刷新仪式的会话 id(★2026-09-28 收紧)。',
  '    //   旧实现 `this.currentSessionId() || this.recentSessionIdFallback()` 的**后半段是跨所有工作区**扫',
  '    //   ~/.dsh/sessions/ 取全局最新 mtime，却只返回一个裸 sessionId、不含工作区 ⇒ 用户手动点「一键接续」时',
  '    //   极可能把**别的工作区**的会话当成刷新目标(实测症状:自动接续正常，手动接续漂到别的工作区)。',
  '    //   现改为:**带了 sessionId 就用它**(调用方最清楚自己在续哪个会话)；没带才退回内存态全局值，',
  '    //   且**不再做跨工作区磁盘回退** —— 拿不到宁可返回空串，让客户端如实报「未给出旧会话 id」，',
  '    //   而不是悄悄刷到别人的会话。旧回退的原始动机(宿主重启后 _lastAgent 未重建)已由调用方传参覆盖。',
  '    const sid = String(sessionId || "") || this.currentSessionId()',
].join('\r\n'))

const ic1 = (ix.match(/\r\n/g) || []).length
const il1 = (ix.match(/\n/g) || []).length
ok(il1 === ic1, 'index.js 写入后出现裸 LF: ' + (il1 - ic1))
ok(ix.includes('const sid = String(sessionId || "") || this.currentSessionId()'), 'B1 未写入')
ok(!ix.includes('|| this.recentSessionIdFallback()'), 'B1 旧写法仍在')
ok(ix.includes('recentSessionIdFallback() {'), 'recentSessionIdFallback 定义被误删')
writeFileSync(IDX, ix)
console.log('index.js: B1 已落 | CRLF ' + ic0 + ' -> ' + ic1 + ' / 裸LF ' + (il1 - ic1))
