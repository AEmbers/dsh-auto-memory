#!/usr/bin/env node
/** [continue-chain] 一键接续 / 自动接续链路防回归(2026-09-08;2.2.4 扩展 G8-G12)。
 * 守卫随包发布的真实代码:lib/client.js(浏览器半边) + lib/index.js(host 半边)。
 *   G1 exports.inject 声明 remote/remote.session(06fbd10:只加 package.json dsh.client.inject 不够,
 *      client 模块自身导出的 inject 数组也必须声明,否则 ctx.remote.session 不被接线)
 *   G2 extractSessionId 对官方 create 的多种返回形态(裸字符串 / {sessionId} / {id} / {value} /
 *      {ok,value:{sessionId}})都能正确取到会话 id(f475321/6a94794)
 *   G3 接续链路收敛到共用执行器:两个入口(oneClickContinue + 自动接续 runAuto)都走 runContinueFlow,
 *      create 返回值只经 extractSessionId 提取一次(防未来重构恢复成对象直取 created.sessionId)
 *   G4 两处 session.prompt 都携带 clientTimeZone(6a94794:缺它被 host 校验拒绝 'rejected request')
 *   G5 create 参数经 continueCreateArgs,带 agentPreset(沿用旧会话预设)
 *   G6 selectModel 带 reasoningEffort(保留模型思考能力)
 *   G7 新会话 rename 为接续序号标题(接续 #N · wsBase;每站点含 zh+en 两个字面量,只数 zh)
 *   —— 2.2.4 实测修复与四条改进 ——
 *   G8 修B:模型/思考档位取自 request/header 的 data.header.config(官方投影同源),request/context 仅回退
 *   G9 修A:workspaceId 归属解析(sessionIds 命中 → 路径兜底 → '' 回退 cwd)
 *   G10 修A:create 传 {workspaceId, agentPreset},不同时传 cwd;解析不到才回退 cwd
 *   G11 ①触发:running true→false 轮次边界(取代"两轮水位持平")
 *   G12 ②确认卡三分支 + ③刷新仪式 + ④材料分层压缩
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { foldSessionLogEvents, workspaceIdForSession } from '../../lib/index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(path.resolve(HERE, '..', '..', 'lib', 'client.js'), 'utf8')
const HSRC = readFileSync(path.resolve(HERE, '..', '..', 'lib', 'index.js'), 'utf8')
let pass = 0, fail = 0
const ok = (c, n) => { if (c) { pass++; console.log('  ok -', n) } else { fail++; console.log('  FAIL -', n) } }
const count = (s, re) => (s.match(re) || []).length

// —— 真实抽取器(花括号配平,同 smoke-test-extract-chunk-flood / handoff-pre)——
function extractFn(src, header) {
  const start = src.indexOf(header)
  if (start < 0) throw new Error('not found: ' + header)
  let depth = 0, end = -1
  for (let i = start + header.length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) throw new Error('unbalanced: ' + header)
  return src.slice(start, end + 1)
}
const bodyOf = (src, header) => extractFn(src, header)

// —— G1:客户端模块自身导出声明 remote/remote.session ——
ok(SRC.includes("exports.inject = ['slots', 'sessions', 'remote', 'remote.session']"),
  'G1 exports.inject declares remote + remote.session (06fbd10)')

// Both browser intents use the host transaction; the host owns creation/model/delivery.
const manual = bodyOf(SRC, 'async function runContinueFlow(opts) {')
ok(manual.indexOf('currentSessionIdClient()') < manual.indexOf('await '), 'source identity captured synchronously')
ok(manual.includes("apiPost(API.autoContDecide, { action: 'manual', sessionId: sourceId })"), 'manual enters host continuation lock')
ok(!manual.includes('session.create') && !manual.includes('session.prompt'), 'browser does not start an independent successor')
ok(HSRC.includes("if (action === 'manual')") && HSRC.includes('return this.hostAutoContinue()'), 'manual shares automatic host executor')
ok(HSRC.includes('await sc.prompt(') && HSRC.includes('await sc.selectModel('), 'host owns carry and model restoration')

// —— G8(修B):模型/思考档位取自 request/header 的 data.header.config ——
const J = (o) => JSON.stringify(o)
const hdr = (provider, model, effort) => J({ type: 'request/header', data: { header: { config: { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) } } } })
const folded = foldSessionLogEvents([
  J({ agentPreset: 'default', cwd: 'D:\\proj' }),
  hdr('p1', 'm1', 'max'),
  J({ type: 'request/context', data: { provider: 'p0', model: 'm0' } }),
  J({ type: 'user/message', data: { message: { role: 'user', content: [{ type: 'text', text: '用户提问' }] } } }),
  J({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: '模型回答' }] } } }),
  J({ type: 'tool/call', data: { name: 'read', arguments: { file_path: 'a.md' } } }),
  J({ type: 'tool/result', data: { message: { role: 'tool', content: [{ type: 'tool-result', content: [{ type: 'text', text: '文件内容' }] }] } } }),
  hdr('p2', 'm2'),
])
ok(folded.provider === 'p2' && folded.model === 'm2', 'G8 request/header wins & last one wins (p2/m2), not request/context (p0/m0)')
ok(folded.reasoningEffort === '', 'G8 header without reasoningEffort => empty (不思考, 不被旧值残留)')
ok(folded.preset === 'default' && folded.cwd === 'D:\\proj', 'G8 header line still yields agentPreset/cwd')
ok(folded.msgs.some((m) => m.role === 'tool_call' && m.text.indexOf('read(') === 0) && folded.msgs.some((m) => m.role === 'tool_result'),
  'G8 tool calls/results kept as structured markers (第2层保留工具标记)')
ok(folded.msgs.filter((m) => m.role === 'user' || m.role === 'assistant').length === 2, 'G8 user/assistant messages preserved')
const legacy = foldSessionLogEvents([J({ agentPreset: 'x' }), J({ type: 'request/context', data: { provider: 'lp', model: 'lm', reasoningEffort: 'high' } })])
ok(legacy.model === 'lm' && legacy.provider === 'lp' && legacy.reasoningEffort === 'high', 'G8 legacy log (request/context only) still falls back')
ok(HSRC.includes("t === 'request/header'") && HSRC.includes("t === 'request/context'"),
  'G8 host reads request/header first, request/context only as fallback (source guard)')
ok(HSRC.includes('data.header.config') || HSRC.includes('ev.data && ev.data.header && ev.data.header.config'),
  'G8 host reads data.header.config (source guard)')
ok(HSRC.includes('msgs.slice(-20)') && HSRC.includes('m.text.slice(0, 700)'),
  'G8 第2层加量:最近 20 条 × 700 字(改进④)')

// —— G9(修A):workspaceId 归属解析 ——
const WSS = [
  { id: 'ws-a', path: 'D:\\proj-a', sessionIds: ['s1', 's2'] },
  { id: 'ws-b', path: 'D:\\proj-b', sessionIds: [] },
]
ok(workspaceIdForSession(WSS, 's2', 'D:\\other') === 'ws-a', 'G9 direct sessionIds match wins (官方 forkWorkspace 同款)')
ok(workspaceIdForSession(WSS, 's-unknown', 'D:\\proj-b\\') === 'ws-b', 'G9 path fallback (trailing slash/case tolerant)')
ok(workspaceIdForSession(WSS, 's-unknown', 'D:\\nope') === '', 'G9 no match => empty (client 回退 cwd)')
ok(workspaceIdForSession(null, 's1', 'D:\\proj-a') === '' && workspaceIdForSession(WSS, '', 'D:\\proj-a') === '', 'G9 null/no-id safe')
ok(HSRC.includes("ctx.get('workspaceRegistry')") && HSRC.includes('resolveWorkspaceIdForSession(') && HSRC.includes('workspaceId: workspaceId'),
  'G9 host resolves workspaceId via workspaceRegistry and returns it')

// Source workspace may fall back to the source cwd, never to an unscoped default.
ok(HSRC.includes('...(d.workspaceId ? { workspaceId: d.workspaceId } : { cwd: d.ws })'), 'prefer source workspace binding')
ok(HSRC.includes('if (!d.ws) throw eCreate') && !HSRC.includes('created = await sc.create(d.agentPreset'), 'fallback remains scoped to source cwd')

// —— G11(①):触发权移交宿主(2.2.6)——边沿观察/倒计时全在 host;client 只轮询状态展示 ——
ok(SRC.includes('function currentRunningInfo()') && (SRC.includes('snap.byId && snap.byId[id]') || SRC.includes('s.byId[sessionId]')),
  'G11 currentRunningInfo still reads authoritative running bit (legacy/manual paths)')
ok(HSRC.includes('engine.armAutoContinue(agent, { ratio: rt2.waterLevel'),
  'G11 trigger moved to host: turn-stopping arms host-side countdown after water measurement')
ok(HSRC.includes('expiresAt: now + sec * 1000') && /autoContinueConfirmSeconds/.test(HSRC),
  'G11 host countdown (confirmSeconds) replaces client 3s short-confirm')
ok(!SRC.includes('wl.tokens === autoState.lastTokens'), 'G11 old "two polls flat tokens = idle" heuristic removed')
ok(SRC.includes('apiGet(API.autoContState,') && SRC.includes('setInterval(poll, 3000)'),
  'G11 client polls host auto-continue state every 3s (render-only)')
ok(HSRC.includes('void engine.tickAutoContinue()'), 'G11 host heartbeat drives deadline execution (15s tick)')

// —— G14(2026-09-10 实机取证):宿主已接续完成后,旧窗口的卡必须收起、提示要有期限、轮询要带会话 id ——
ok(/if \(s\.executing\) \{[\s\S]{0,700}?setAcConfirm\(null\)/.test(SRC) && /if \(s\.lastOk && \(okAt === 0/.test(SRC) && /(okAt === 0[\s\S]{0,200}?setAcConfirm\(null\))/.test(SRC),
  'G14 executing / lastOk 分支先收起确认卡(旧实现直接 return → 卡片与「✓ 已自动接续」并存)')
ok(SRC.includes('okAt === 0 || Date.now() - okAt < 10 * 60 * 1000'),
  'G14 「已完成」提示设 10 分钟有效期(宿主状态是全局单值,不设期限会一直挂在每个窗口上)')
ok(SRC.includes('apiGet(API.autoContState, sidQ ? { sessionId: sidQ } : {})') && SRC.includes('currentSessionIdClient()'),
  'G14 轮询携带当前会话 id(宿主据此只在本窗口弹确认卡)')
ok(HSRC.includes("url.searchParams.get('sessionId')") && HSRC.includes('autoContinueState(selfSid)'),
  'G14 宿主侧按 sessionId 过滤 armed(取不到 id 时 fail-open)')
ok(/setAcConfirm\(\{ sessionId: arm.sessionId, ratio: Number\(arm\.ratio\) \|\| 0[\s\S]{0,220}?wall: Number\(arm\.wall\) \|\| 0/.test(SRC),
  'G14 确认卡把双口径 ring/wall 拷进 acConfirm(宿主透出但这里丢了 → 那行永不渲染)')

// —— G15(2026-09-28 修「接续必须搭线」):宿主兜底接续后,前端补 sessions.open 把发件人切到新会话 ——
ok(/fromSidAc && sidQ === fromSidAc && doneSid !== acOpenedSidRef\.current[\s\S]{0,260}?sessions\.open\(doneSid\)/.test(SRC),
  'G15 lastOk 命中时补 sessions.open(宿主兜底路径原本缺 UI 切换 → 发件人留在旧会话形成循环)')
ok(SRC.includes("var fromSidAc = String((s.lastOk && s.lastOk.fromSid) || '')") && /sidQ === fromSidAc/.test(SRC),
  'G15 只切「正看着旧会话」的窗口(fromSid 收窄;lastOk 全局透出,无差别 open 会拉走别的标签页)')
ok(HSRC.includes('fromSid: oldSid') && HSRC.includes('fromSid: st.lastOk.fromSid'),
  'G15 宿主 lastOk 带被接续的旧会话 id(fromSid),供前端收窄切换作用域')

// —— G12(②③④):确认卡三分支(同意/拒绝交宿主,超时宿主执行)+ 刷新仪式 + 材料分层 ——
ok(SRC.includes('autoContAgree') && SRC.includes('autoContReject') && SRC.includes('autoContTimeout'),
  'G12 confirm card has agree / reject / timeout labels')
ok(SRC.includes("action: 'agree'") && SRC.includes("action: 'reject'"),
  'G12 decisions posted to host (host owns execution)')
ok(HSRC.includes('st.rejectedEdgeAt = armedEdge') && HSRC.includes('now - st.rejectedEdgeAt < 10 * 60 * 1000'),
  'G12 rejection recorded host-side (10min window, re-evaluated at next boundary)')
ok(HSRC.includes('Date.now() < st.armed.expiresAt') && HSRC.includes('await this.hostAutoContinue()'),
  'G12 host timeout auto-continues (unattended fallback)')
// ★2026-09-30 守卫演进(用户报障「A区点接续，新会话建到B区」):
ok(HSRC.includes('continuationRitualEndPre(snap && snap.events, reqId, baseSeq)'), 'request-correlated ritual turn must finish')
ok(HSRC.includes('refresh ritual failed: '), 'unverified ritual prevents successor creation')
ok(manual.includes('if (!sourceId) throw'), 'no source identity is an explicit error')

// —— G13(①读取面):真实驱动 currentRunningInfo/runningOfSession(sessions 服务快照) ——
const makeRunningFns = new Function('sessions', extractFn(SRC, 'function currentRunningInfo() {') + '\n' + extractFn(SRC, 'function runningOfSession(sessionId) {') + '\nreturn { currentRunningInfo, runningOfSession }')
const fnsIdle = makeRunningFns({ list: { getSnapshot: () => ({ current: 's1', byId: { s1: { id: 's1', running: false }, s2: { id: 's2', running: true } } }) } })
ok(JSON.stringify(fnsIdle.currentRunningInfo()) === JSON.stringify({ sessionId: 's1', running: false }), 'G13 currentRunningInfo reads current session running bit')
ok(fnsIdle.runningOfSession('s2') === true && fnsIdle.runningOfSession('s1') === false, 'G13 runningOfSession per-session bit')
ok(fnsIdle.runningOfSession('missing') === null, 'G13 unknown session => null (不误判空闲)')
const fnsBroken = makeRunningFns(null)
ok(fnsBroken.currentRunningInfo() === null && fnsBroken.runningOfSession('s1') === null, 'G13 no sessions service => null (不抛错)')
ok(makeRunningFns({ list: { getSnapshot: () => ({ current: undefined, byId: {} }) } }).currentRunningInfo() === null,
  'G13 no current session => null (不触发接续)')

console.log('\n[smoke-test-continue-chain] ' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
