/**
 * verify-r16-e2e.mjs —— ★R16 端到端验收：下行 puller → 归属旁挂索引（跨模块契约）。
 *
 * 存在理由（实测缺口）：verify-team-pull.mjs 用**桩**接 onApplied，verify-team-attribution.mjs
 * 直接调 record()，**两者各测各的** ⇒ 「puller 喂给 attribution 的形状是否对得上」从未被真跑验过。
 * 本验收器把**两个真模块**串起来，按 70 卷 R16 判据「正 / 负 / 隔离三路径」逐条断。
 *
 * CR-10：真 import → 真构造 → 真调用 → 断言返回值；每条带负路径；给可复算物理量。
 */
import { createTeamPuller } from '../lib/team-pull.js'
import { createTeamAttribution, TEAM_ATTRIBUTION_FILE } from '../lib/team-attribution.js'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0; const failures = []
function ok(c, n, got) { if (c) pass++; else { fail++; failures.push(n + (got === undefined ? '' : ' | got=' + JSON.stringify(got))) } }
function eq(a, b, n) { ok(a === b, n + '（期望 ' + JSON.stringify(b) + '，实得 ' + JSON.stringify(a) + '）') }
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
/* ★第 3 条纪律：期望值由源码派生，不凭直觉手写。op 合法集合从 team-attribution.js 现读。 */
const TA_SRC = readFileSync(join(ROOT, 'lib', 'team-attribution.js'), 'utf8')
const OPS_PRE = (TA_SRC.match(/const OPS_PRE = \[([^\]]+)\]/) || [, ''])[1]
  .split(',').map(function (s) { return s.trim().replace(/^'|'$/g, '') }).filter(Boolean)
const LEGAL_OP = OPS_PRE[0]        // 'create'——取集合首项，避免手写

/** 装配层替身：把 puller 的 onApplied 接到真 attribution（与 index.js:12138 同构）。 */
function wire(opts) {
  const att = createTeamAttribution({
    teamEnabled: opts.teamEnabled, path: '/tmp/team-attribution.json',
    now: function () { return 1700000000000 },
  })
  const disk = { writes: 0 }
  const rec = function (list) { disk.writes += 1; return att.recordMany(list) }
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: opts.teamEnabled } },
    fetchJson: async function () { return { ok: true, data: { cursor: 1, changes: opts.changes } } },
    conflictCenter: null,
    appliers: { fact: function () { if (opts.dirty) return { ok: false, gateRejected: true }; return { ok: true, outcome: 'applied' } } },
    onApplied: function (entry) { rec([entry]) },
    diag: function () {},
  })
  return { att: att, disk: disk, puller: puller }
}

/* ═══ 正路径：含 member 的条目 ⇒ 归属索引里作者 = 上传者 id（37 卷 §1 第一条） ═══ */
console.log('\n=== 正路径 下行含 member ⇒ 作者落盘 ===')
{
  const w = wire({ teamEnabled: true, changes: [
    { kind: 'fact', key: 'k-alice', member: { id: 'u-alice', name: 'Alice' }, op: LEGAL_OP },
  ] })
  const r = await w.puller.pullOnce()
  eq(r.applied, 1, 'P1 ★端到端 applied = 1')
  const got = w.att.get('k-alice')
  ok(got !== null, 'P2 ★归属索引里有该 key（真串联成功）', got)
  eq(got && got.memberId, 'u-alice', 'P3 ★★作者 = 上传者 id（37 卷正路径逐字）')
  eq(got && got.memberName, 'Alice', 'P4 作者名')
  eq(got && got.op, LEGAL_OP, 'P5 op 透传（期望取自源码 OPS_PRE[0]=' + LEGAL_OP + '）')
  eq(w.att.size(), 1, 'P6 条目数 = 1')
  eq(w.disk.writes, 1, 'P7 归属写次数 = 1')
  const j = w.att.toJSON()
  eq(j.schema, 1, 'P8 schema = 1')
  eq(Object.keys(j.items).length, 1, 'P9 items 键数 = 1')
}

/* ═══ 负路径 C：非法 op ⇒ 归一为 'edit'（不是原样透传） ═══ */
console.log('\n=== 负路径C 非法 op 归一 ===')
{
  const att = createTeamAttribution({ teamEnabled: true, path: '/tmp/z.json', now: function () { return 7 } })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () { return { ok: true, data: { cursor: 1, changes: [{ kind: 'fact', key: 'k-bad-op', member: { id: 'u-op', name: 'Op' }, op: '__nope__' }] } } },
    conflictCenter: null, appliers: { fact: function () { return { ok: true, outcome: 'applied' } } },
    onApplied: function (e) { att.recordMany([e]) }, diag: function () {},
  })
  await puller.pullOnce()
  const g = att.get('k-bad-op')
  ok(g !== null, 'N7 非法 op 仍写入（不丢条目）', g)
  eq(g && g.op, 'edit', 'N8 ★非法 op 归一为 edit')
  ok(OPS_PRE.indexOf(g && g.op) >= 0, 'N9 ★归一后落在源码合法集合内（' + OPS_PRE.join('/') + '）')
}

/* ═══ 正路径 2：member 只在 res.member 上（不常见但已支持）⇒ 同样落盘 ═══ */
console.log('\n=== 正路径2 res.member 兜底 ===')
{
  const att = createTeamAttribution({ teamEnabled: true, path: '/tmp/x.json', now: function () { return 1 } })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () { return { ok: true, data: { cursor: 1, changes: [{ kind: 'fact', key: 'k-b', op: LEGAL_OP }] } } },
    conflictCenter: null,
    appliers: { fact: function () { return { ok: true, outcome: 'applied', member: { id: 'u-bob', name: 'Bob' } } } },
    onApplied: function (e) { att.recordMany([e]) }, diag: function () {},
  })
  await puller.pullOnce()
  const gb = att.get('k-b')
  eq(gb && gb.memberId, 'u-bob', 'P10 ★res.member 兜底生效')
}

/* ═══ 负路径 A：条目缺 member ⇒ 归属索引**不写**（不得留空占位） ═══ */
console.log('\n=== 负路径A 缺 member ⇒ 不写归属 ===')
{
  const w = wire({ teamEnabled: true, changes: [{ kind: 'fact', key: 'k-nobody', op: LEGAL_OP }] })
  const r = await w.puller.pullOnce()
  eq(r.applied, 1, 'N1 主流程仍 applied = 1（不因缺作者而中断）')
  eq(w.att.size(), 0, 'N2 ★★缺 member ⇒ 归属条目数 = 0（未写入）')
  eq(w.att.get('k-nobody'), null, 'N3 ★get 返回 null（无空占位）')
}

/* ═══ 负路径 B：条目被 Gate 拒 ⇒ 既不下行也不写归属 ═══ */
console.log('\n=== 负路径B 被拒 ⇒ 不写归属 ===')
{
  const w = wire({ teamEnabled: true, dirty: true, changes: [
    { kind: 'fact', key: 'k-dirty', member: { id: 'u-x', name: 'X' }, op: LEGAL_OP },
  ] })
  const r = await w.puller.pullOnce()
  eq(r.applied, 0, 'N4 被拒 applied = 0')
  eq(r.rejected, 1, 'N5 rejected = 1')
  eq(w.att.size(), 0, 'N6 ★★被拒条目不得写归属（onApplied 未触发）')
}

/* ═══ 隔离路径：teamEnabled=false ⇒ 归属文件不创建、不写入 ═══ */
console.log('\n=== 隔离路径 teamEnabled=false ===')
{
  const w = wire({ teamEnabled: false, changes: [
    { kind: 'fact', key: 'k-iso', member: { id: 'u-iso', name: 'Iso' }, op: LEGAL_OP },
  ] })
  const r = await w.puller.pullOnce()
  eq(r.ok, false, 'I1 puller 直接拒绝（team-disabled）')
  eq(r.reason, 'team-disabled', 'I2 原因 = team-disabled')
  eq(w.att.size(), 0, 'I3 ★归属条目数 = 0')
  eq(w.disk.writes, 0, 'I4 ★★归属写次数 = 0（老用户零新增文件）')
  eq(w.att.get('k-iso'), null, 'I5 get 仍为 null')
  const j = w.att.toJSON()
  eq(Object.keys(j.items).length, 0, 'I6 toJSON 无条目 ⇒ 不会落盘出文件')
  eq(w.att.describe().file, TEAM_ATTRIBUTION_FILE, 'I7 文件名常量 = team-attribution.json（37 卷 §1）')
}

/* ═══ 幂等/覆盖：同 key 再来一条（不同作者）⇒ 取最新作者、size 不变 ═══ */
console.log('\n=== 幂等 同 key 覆盖 ===')
{
  const att = createTeamAttribution({ teamEnabled: true, path: '/tmp/y.json', now: function () { return 5 } })
  const mk = function (id, nm) {
    return createTeamPuller({
      engine: { config: { teamEnabled: true } },
      fetchJson: async function () { return { ok: true, data: { cursor: 1, changes: [{ kind: 'fact', key: 'k-dup', member: { id: id, name: nm }, op: 'edit' }] } } },
      conflictCenter: null, appliers: { fact: function () { return { ok: true, outcome: 'applied' } } },
      onApplied: function (e) { att.recordMany([e]) }, diag: function () {},
    })
  }
  await mk('u-1', 'One').pullOnce()
  await mk('u-2', 'Two').pullOnce()
  eq(att.size(), 1, 'D1 同 key ⇒ size 仍为 1')
  const dup = att.get('k-dup')
  eq(dup && dup.memberId, 'u-2', 'D2 ★取最新作者')
}

/* ═══ 可复算物理量 ═══ */
console.log('\n=== 可复算物理量 ===')
{
  const tp = readFileSync(join(ROOT, 'lib', 'team-pull.js'), 'utf8')
  const ta = readFileSync(join(ROOT, 'lib', 'team-attribution.js'), 'utf8')
  console.log('  lib/team-pull.js         : ' + Buffer.byteLength(tp, 'utf8') + ' B / sha16 ' + sha16(tp) + ' / ' + tp.split('\n').length + ' 行')
  console.log('  lib/team-attribution.js  : ' + Buffer.byteLength(ta, 'utf8') + ' B / sha16 ' + sha16(ta) + ' / ' + ta.split('\n').length + ' 行')
  ok(Buffer.byteLength(tp, 'utf8') > 0 && Buffer.byteLength(ta, 'utf8') > 0, 'Q1 两模块均非空（可复算）')
  ok(tp.indexOf('onApplied({ key: ch.key') >= 0, 'Q2 ★形状契约锚在场（key/member/op 三元）')
  ok(ta.indexOf('function record(key, member, op)') >= 0, 'Q3 ★被调方签名匹配')
}

console.log('\n' + '='.repeat(52))
if (fail === 0) { console.log('PASS ' + pass + ' / FAIL 0 — ALL GREEN'); process.exit(0) }
console.log('PASS ' + pass + ' / FAIL ' + fail);
failures.forEach(function (f) { console.log('  FAIL: ' + f) });
process.exit(1)