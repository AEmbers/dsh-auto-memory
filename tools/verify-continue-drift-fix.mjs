/**
 * 核验「一键接续漂移」修复的 5 处代码是否真的落盘（只读）。
 * 并附**负路径**：旧写法必须不存在。
 */
import { readFileSync } from 'node:fs'

const CL = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')
const IX = readFileSync('D:/dsh-auto-memory/lib/index.js', 'utf8')

let fail = 0
const check = (name, cond) => {
  console.log((cond ? '  OK  ' : '  FAIL') + '  ' + name)
  if (!cond) fail++
}

console.log('=== 正向：新代码必须在 ===')
check('A1 刷新仪式带自己的会话 id', CL.includes('apiGet(API.handoffState, selfSid ? { sessionId: selfSid } : {})'))
check('A1b selfSid 取值', CL.includes('var selfSid = String(currentSessionIdClient() || "")'))
check('A2 严格校核', CL.includes('lastRefreshSessionId = (selfSid && rfSid === selfSid) ? rfSid : ""'))
check('A3 优先序翻转', CL.includes("var fromSidForCarry = String(currentSessionIdClient() || lastRefreshSessionId || '')"))
check('A4 waitForRefresh 带 oldId', CL.includes('apiGet(API.handoffState, oldId ? { sessionId: oldId } : {})'))
check('B1 宿主按 sessionId 取刷新目标', IX.includes('const sid = String(sessionId || "") || this.currentSessionId()'))

console.log('\n=== 负路径：旧写法必须消失（只看代码行，不看注释）===')
// 剥掉注释后再判，避免「注释里提到旧写法」造成假命中
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const CLc = strip(CL)
const IXc = strip(IX)
check('N1 刷新仪式不再裸调 handoffState', !/var st = await apiGet\(API\.handoffState\)/.test(CLc))
check('N2 waitForRefresh 不再裸调', !/st2 = await apiGet\(API\.handoffState\)/.test(CLc))
check('N3 宿主不再用 recentSessionIdFallback 当刷新目标', !/const sid = this\.currentSessionId\(\) \|\| this\.recentSessionIdFallback\(\)/.test(IXc))
check('N4 fromSidForCarry 旧优先序已消失', !/fromSidForCarry = String\(lastRefreshSessionId \|\| currentSessionIdClient/.test(CLc))

console.log('\n=== 未误伤 ===')
check('recentSessionIdFallback 定义仍在（仅不再用于此路径）', IX.includes('recentSessionIdFallback() {'))
check('handoffContinue 仍传 fromSessionId', CL.includes('apiPost(API.handoffContinue, fromSidForCarry ? { fromSessionId: fromSidForCarry } : {})'))
check('面板按会话取数未动', CL.includes('apiGet(API.handoffState, { sessionId: sid })'))

const crlfc = (CL.match(/\r\n/g) || []).length, lfc = (CL.match(/\n/g) || []).length
const crlfi = (IX.match(/\r\n/g) || []).length, lfi = (IX.match(/\n/g) || []).length
console.log('\n=== 物理量 ===')
console.log('client.js CRLF ' + crlfc + ' / 裸LF ' + (lfc - crlfc) + '  (期望 裸LF 0)')
console.log('index.js  CRLF ' + crlfi + ' / 裸LF ' + (lfi - crlfi) + '  (期望 裸LF 0)')
if (lfc - crlfc !== 0 || lfi - crlfi !== 0) fail++

console.log('\n结果：' + (fail === 0 ? '全部通过' : fail + ' 项失败'))
process.exit(fail === 0 ? 0 : 1)
