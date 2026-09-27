#!/usr/bin/env node
/**
 * smoke-test-team-identity-seam.mjs —— ★**接缝测试**：identity ⇄ sync 的契约对接。
 *
 * ## 为什么有这个套件（真实缺陷产物，2026-09-27）
 * 实测发现一处**阻断性缺陷**：`team-sync.js` 的 sender 判据写的是 `member.ok !== true`，
 * 而 `team-identity.js` 的 `currentMember()` **契约里没有 ok 字段**
 * （它的契约逐字是「读到身份返回 {id,name,role,teamId,source,at}；未登记返回 null」；
 *   `ok` 是 `describe()` 的字段）。
 * ⇒ 旧判据**恒为 true** ⇒ 每条变更都抛 `identity-not-registered` ⇒
 *   **已登记 administrator 身份时，同步发出请求 0 次**（团队同步完全不可用）。
 *
 * ## 为什么 182 个既有套件没抓到
 * 各模块**单独测都过**（identity 自己的契约对、sync 自己的单飞/退避对），
 * **唯独两者对接处没人测** ⇒ 典型「假绿」。
 * ⇒ 本套件专测**接缝**，补齐 CR-10 的最后一环。
 *
 * ## 判据（全部真构造 → 真调用 → 断言真返回值；含负路径）
 *  S1 正路径：已登记 administrator ⇒ sync 真发出请求（修复前为 0，本断言必然红）
 *  S2 负路径：未登记身份 ⇒ **必须不发**（且抛 identity-not-registered，不得静默出队）
 *  S3 红线：teamEnabled=false ⇒ tick 零动作（个人用户不受团队改动影响）
 *  S4 契约形状：currentMember() 与 describe() 的返回形状**各自**被钉死
 */
import { createTeamIdentity } from '../../lib/team-identity.js'
import { createTeamSync } from '../../lib/team-sync.js'

let pass = 0, fail = 0
const failures = []
function ok(cond, name, got) {
  if (cond) { pass++ } else { fail++; failures.push(name + (got === undefined ? '' : ' | got=' + JSON.stringify(got))) }
}
function eq(a, b, name) { ok(a === b, name, { got: a, want: b }) }

/** 真构造一个 sender 环境；返回 {sync, sentRef, throws} */
function mkEnv(cfg) {
  const engine = { config: cfg }
  const identity = createTeamIdentity({ ctx: {}, engine })
  const sentRef = { n: 0 }
  const throws = []
  const sync = createTeamSync({
    engine,
    identity,
    outbox: {
      flush: async (sender) => {
        try { await sender({ kind: 'note', key: 'k1', at: 1, payload: { v: 'x' } }); return { sent: 1, failed: 0 } }
        catch (e) { throws.push(String(e && e.message)); return { sent: 0, failed: 1 } }
      },
    },
    teamFetch: async () => { sentRef.n++; return { ok: true } },
  })
  return { sync, sentRef, throws, identity }
}

// ── S1 正路径：已登记 ⇒ 真发出 ──────────────────────────────────────────────
{
  const { sync, sentRef, throws } = mkEnv({ teamEnabled: true, teamMemberId: 'alice', teamMemberRole: 'administrator', teamId: 't1' })
  const r = await sync.tick()
  eq(sentRef.n, 1, 'S1a 已登记 administrator ⇒ sync 真发出 1 次请求（修复前恒为 0）')
  eq(throws.length, 0, 'S1b 不得抛 identity-not-registered')
  eq(r.sent, 1, 'S1c tick 报告 sent=1')
}

// ── S2 负路径：未登记 ⇒ 必须不发（不得静默出队）────────────────────────────
{
  const { sync, sentRef, throws } = mkEnv({ teamEnabled: true, teamId: 't1' })
  await sync.tick()
  eq(sentRef.n, 0, 'S2a 未登记身份 ⇒ 发出请求 0 次（不得静默出队）')
  eq(throws[0], 'identity-not-registered', 'S2b 抛错原因恰为 identity-not-registered')
}

// ── S3 红线：teamEnabled=false ⇒ 零动作（1 万个人用户不受影响）──────────────
{
  const { sync, sentRef } = mkEnv({ teamEnabled: false, teamMemberId: 'bob', teamMemberRole: 'viewer' })
  const r = await sync.tick()
  eq(r.skipped, true, 'S3a teamEnabled=false ⇒ tick skipped')
  eq(r.reason, 'team-disabled', 'S3b 跳过原因恰为 team-disabled')
  eq(sentRef.n, 0, 'S3c 团队关闭 ⇒ 零网络调用')
}

// ── S4 契约形状钉死（防止任一侧再漂移）────────────────────────────────────
{
  const engine = { config: { teamEnabled: true, teamMemberId: 'alice', teamMemberRole: 'editor', teamId: 't9' } }
  const id = createTeamIdentity({ ctx: {}, engine })
  const m = id.currentMember()
  ok(m && typeof m === 'object', 'S4a currentMember() 已登记 ⇒ 返回对象（非 null）')
  eq(m.id, 'alice', 'S4b currentMember().id 正确')
  eq(m.role, 'editor', 'S4c currentMember().role 正确')
  eq(m.teamId, 't9', 'S4d currentMember().teamId 正确')
  // ★契约钉死：currentMember 的字段集（ok 不在此列 —— 这是本缺陷的根因）
  const keys = Object.keys(m).sort().join(',')
  eq(keys, 'at,id,name,role,source,teamId', 'S4e ★currentMember() 字段集被钉死（不含 ok；含 ok 说明契约被擅自改动）')

  const d = id.describe()
  eq(d.ok, true, 'S4f describe() 已登记 ⇒ ok=true（ok 是 describe 的字段，不是 currentMember 的）')
  const dk = Object.keys(d).sort().join(',')
  eq(dk, 'memberId,ok,role,source', 'S4g describe() 字段集被钉死')

  // 未登记时 currentMember 必须恰为 null（不是 {}、不是 undefined）
  const id2 = createTeamIdentity({ ctx: {}, engine: { config: { teamEnabled: true } } })
  eq(id2.currentMember(), null, 'S4h 未登记 ⇒ currentMember() 恰为 null')
  eq(id2.describe().ok, false, 'S4i 未登记 ⇒ describe().ok=false')
}

// ── 汇总 ───────────────────────────────────────────────────────────────────
if (fail) {
  console.log('FAIL ' + fail + ' / PASS ' + pass)
  for (const f of failures) console.log('  ✗ ' + f)
  process.exit(1)
}
console.log('PASS ' + pass + ' / FAIL 0  （identity ⇄ sync 接缝）')
