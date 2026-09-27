#!/usr/bin/env node
/**
 * smoke-test-procedure-dual-approval.mjs —— ★G-F1 双签（CR-10 真构造档）
 *
 * ## 背景（用户裁定，2026-09-27）
 * 「**高风险肯定就用现有的这个配置就可以了**」⇒ 复用已有的 `riskLevel` 字段，
 * **零新增配置键**；开关是 `gates.highRiskDualApproval`。
 *
 * ## ★红线：个人用户零变化
 * 默认 `highRiskDualApproval=false` ⇒ 走**现有单人批准**（一次 `approve` 即解门），
 * 与改动前**行为等价**。理由（用户原话）：「它主要还是供给个人使用，公司是顺带的……
 * 我怕是怕如果改出这个权限禁用的话，会对个人用户造成影响」。
 *
 * ## 判据（真构造 store → 真 observe → 真 approve → 断言真返回值；含负路径）
 *  A 单人模式（默认）：一次批准即解门 + 幂等（**旧行为回归锁**）
 *  B 双签模式：第一人门仍关 / 同一人不计数 / 第二人才开 / 留痕不可改写 / 第三人不污染
 *  C 低风险：双签模式也不拦（@notRequired@）
 *  D 默认常量：`highRiskDualApproval === false`（红线守卫）
 *  E 校验器：`approvals` 类型门（含两条负路径）
 */
import { createProcedureStorePre, validateProcedurePre, PROCEDURE_DEFAULT_GATES_PRE_V1 } from '../../lib/procedure-store.js'

let pass = 0, fail = 0
const failures = []
function ok(cond, name, got) {
  if (cond) { pass++ } else { fail++; failures.push(name + (got === undefined ? '' : ' | got=' + JSON.stringify(got))) }
}
function eq(a, b, name) { ok(a === b, name, { got: a, want: b }) }

/** 纯内存 IO，零磁盘副作用（不碰 ~/.dsh） */
function memIO() { let s = null; return { save: (x) => { s = JSON.parse(JSON.stringify(x)) }, load: () => s } }
const G = (extra) => Object.assign({ minSessionDiversity: 0, minSuccessCount: 0, maxCorrectionRate: 1, maxContradictions: 99, highRiskRequiresApproval: true }, extra || {})

// ── A 单人模式（默认）—— 旧行为回归锁 ────────────────────────────────────
{
  const st = createProcedureStorePre({ gates: G(), io: memIO() })
  const pid = st.observe({ title: 'A高风险', riskLevel: 'high', steps: ['s'], successCriteria: ['d'] }).procedure.procedureId
  const a1 = st.approve(pid, 'alice')
  eq(a1.approved, true, 'A1 ★默认单人：一次批准即解门（与旧行为等价）')
  eq(a1.procedure.approved, true, 'A2 记录 approved=true')
  eq(a1.procedure.approvedBy, 'alice', 'A3 approvedBy=alice')
  const a2 = st.approve(pid, 'alice')
  eq(a2.alreadyApproved, true, 'A4 重复批准 ⇒ 幂等')
}

// ── B 双签模式 ─────────────────────────────────────────────────────────
{
  const st = createProcedureStorePre({ gates: G({ highRiskDualApproval: true }), io: memIO() })
  const pid = st.observe({ title: 'B高风险', riskLevel: 'high', steps: ['s'], successCriteria: ['d'] }).procedure.procedureId
  const b1 = st.approve(pid, 'alice')
  eq(b1.approved, false, 'B1 ★第一人批准 ⇒ 门仍关')
  eq(b1.pendingApproval, true, 'B2 标记 pendingApproval')
  eq(b1.needMore, 1, 'B3 明确告知还差 1 人')
  const b2 = st.approve(pid, 'alice')
  eq(b2.approved, false, 'B4 ★同一人重复批准 ⇒ 不计数（门仍关）')
  eq(b2.alreadyApproved, true, 'B5 标记 alreadyApproved')
  const b3 = st.approve(pid, 'bob')
  eq(b3.approved, true, 'B6 ★★第二人（不同人）⇒ 门开')
  eq(b3.procedure.approvals.length, 2, 'B7 留痕恰 2 人')
  eq(b3.procedure.approvedBy, 'alice', 'B8 首次批准者保留（留痕不可被改写）')
  const b4 = st.approve(pid, 'carol')
  eq(b4.alreadyApproved, true, 'B9 第三人不计数')
  eq(b4.procedure.approvals.length, 2, 'B10 留痕仍 2 人（未被第 3 人污染）')
}

// ── C 低风险不拦 ───────────────────────────────────────────────────────
{
  const st = createProcedureStorePre({ gates: G({ highRiskDualApproval: true }), io: memIO() })
  const pid = st.observe({ title: 'C低风险', riskLevel: 'low', steps: ['s'], successCriteria: ['d'] }).procedure.procedureId
  eq(st.approve(pid).notRequired, true, 'C1 ★低风险 ⇒ 双签模式也不拦')
}

// ── D 默认常量（红线守卫）────────────────────────────────────────────────
{
  eq(PROCEDURE_DEFAULT_GATES_PRE_V1.highRiskDualApproval, false, 'D1 ★默认 highRiskDualApproval=false（个人用户零变化）')
}

// ── E 校验器 approvals 类型门 ─────────────────────────────────────────────
{
  const base = { procedureId: 'proc_pre_' + 'a'.repeat(32), stage: 'observed', riskLevel: 'low', title: 't', sourceMemoryIds: [], sourceEpisodes: [], steps: ['s'], checks: [], successCriteria: [], rollback: [], createdAt: 1 }
  ok(validateProcedurePre(Object.assign({}, base, { approvals: ['a', 'b'] })).ok, 'E1 字符串数组 ⇒ 通过')
  ok(validateProcedurePre(Object.assign({}, base, { approvals: [] })).ok, 'E2 空数组 ⇒ 通过')
  eq(validateProcedurePre(Object.assign({}, base, { approvals: [1] })).ok, false, 'E3 ★负路径：非字符串元素 ⇒ 拒绝')
  eq(validateProcedurePre(Object.assign({}, base, { approvals: 'ab' })).ok, false, 'E4 ★负路径：非数组 ⇒ 拒绝')
  ok(validateProcedurePre(base).ok, 'E5 旧快照无 approvals ⇒ 仍通过（向后兼容）')
}

if (fail) {
  console.log('FAIL ' + fail + ' / PASS ' + pass)
  for (const f of failures) console.log('  ✗ ' + f)
  process.exit(1)
}
console.log('PASS ' + pass + ' / FAIL 0  （G-F1 双签 + 红线守卫）')
