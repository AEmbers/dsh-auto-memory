/**
 * verify-team-pull.mjs —— B6 下行合并且验收（CR-10 硬纪律）。
 *
 * **真 import → 真构造 → 真调用 → 断言返回值**，每条判据都带负路径。
 * 严禁用「源码含某字符串」充当功能验收。
 *
 * 判据对应 06 卷 §B6 四条：
 *   1. 不绕过 Gate：脏事实走既有 upsert 被拒（计数+1），**没有直接写盘**
 *   2. 冲突保留双方：同一三元组两个 object ⇒ conflict-added，双方 provenance 都在
 *   3. 未知 kind 被拒且留痕：返回 false + diag
 *   4. 拒绝可见：recordRejected 被调用（不是静默丢弃）
 */
import { createTeamPuller, TEAM_PULL_KINDS_PRE } from '../lib/team-pull.js'
import { createTeamMerge } from '../lib/team-merge.js'

let pass = 0, fail = 0
const failures = []
function ok(cond, name, got) {
  if (cond) { pass++ }
  else { fail++; failures.push(name + (got === undefined ? '' : ' | got=' + JSON.stringify(got))) }
}
function eq(a, b, name) { ok(a === b, name + '（期望 ' + JSON.stringify(b) + '，实得 ' + JSON.stringify(a) + '）') }

/** 造一个「计数写盘」的桩：任何真写入都会让它 +1。 */
function makeDiskProbe() {
  const probe = { writes: 0, writes_: [] }
  probe.write = function (what) { probe.writes += 1; probe.writes_.push(String(what)) }
  return probe
}

const diags = []
function diag(msg) { diags.push(String(msg)) }
const appliedLog = []
function onApplied(e) { appliedLog.push(e) }

/* ═══ 判据 1：不绕过 Gate —— 脏事实被既有 upsert 拒，且**没有直接写盘** ═══ */
console.log('\n=== 判据1 不绕过 Gate（脏事实被拒 + 零写盘）===')
{
  const disk = makeDiskProbe()
  const merge = createTeamMerge({ maxConflicts: 10 })
  // 注入的 applier = 既有 upsert 的桩：它**自己走 Gate**（此处模拟被拒）
  const appliers = {
    fact: function (payload) {
      // 模拟既有 factStore.upsert 的 Gate 行为：脏数据 ⇒ ok:false
      if (!payload || payload.__dirty) return { ok: false, gateRejected: true }
      disk.write('fact:' + payload.key)          // 只有干净数据才落盘
      return { ok: true, outcome: 'applied' }
    },
  }
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () {
      return { ok: true, data: { cursor: 5, changes: [{ kind: 'fact', key: 'k1', payload: { __dirty: true } }] } }
    },
    conflictCenter: merge, appliers: appliers, diag: diag, onApplied: onApplied,
  })
  const r = await puller.pullOnce()
  eq(r.ok, true, '1a pullOnce 返回 ok')
  eq(r.total, 1, '1b 拉到 1 条')
  eq(r.applied, 0, '1c ★脏事实 applied=0（被既有校验拒）')
  eq(r.rejected, 1, '1d ★rejected=1（计数 +1）')
  eq(disk.writes, 0, '1e ★★磁盘写入数 = 0（没有直接写盘）')
  eq(merge.rejected().total, 1, '1f 拒绝已进 conflictCenter（判据4 的前半）')
}

/* ═══ 判据 1 负路径：同样的输入，干净数据应通过并落盘 1 次 ═══ */
console.log('\n=== 判据1-负路径 干净事实应通过 ===')
{
  const disk = makeDiskProbe()
  const merge = createTeamMerge({ maxConflicts: 10 })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () {
      return { ok: true, data: { cursor: 9, changes: [{ kind: 'fact', key: 'ok1', payload: { key: 'ok1' } }] } }
    },
    conflictCenter: merge,
    appliers: { fact: function (p) { disk.write('fact:' + p.key); return { ok: true, outcome: 'applied' } } },
    diag: diag, onApplied: onApplied,
  })
  const r = await puller.pullOnce()
  eq(r.applied, 1, '1g 干净事实 applied=1')
  eq(r.rejected, 0, '1h 干净事实 rejected=0')
  eq(disk.writes, 1, '1i ★磁盘写入数恰好 1（走的正是注入的写路径）')
  eq(merge.rejected().total, 0, '1j 无拒绝记录（不是恒真）')
}

/* ═══ 判据 2：冲突保留双方 —— conflict-added ⇒ 进冲突中心，provenance 齐 ═══ */
console.log('\n=== 判据2 冲突保留双方 ===')
{
  const merge = createTeamMerge({ maxConflicts: 10 })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () {
      return {
        ok: true, data: { cursor: 3, changes: [{
          kind: 'fact', key: 'tri', member: { id: 'u-alice' },
          payload: { key: 'tri' },
        }] },
      }
    },
    conflictCenter: merge,
    appliers: {
      fact: function () {
        return {
          ok: true, outcome: 'conflict-added', member: 'u-alice',
          conflicts: [{ key: 'tri', base: undefined, local: { a: 1 }, remote: { a: 2 } }],
        }
      },
    },
    diag: diag, onApplied: onApplied,
  })
  const r = await puller.pullOnce()
  eq(r.applied, 1, '2a 冲突条目仍算已应用（不是被拒）')
  eq(r.rejected, 0, '2b 不算拒绝')
  const c = merge.counts()
  eq(c.pending, 1, '2c ★冲突中心 pending=1')
  const p = merge.pending()[0]
  eq(p.key, 'tri', '2d 冲突键正确')
  ok('local' in p && 'remote' in p && 'base' in p, '2e ★★双方 provenance 都在（base/local/remote 三字段齐）', Object.keys(p))
  eq(p.byMember, 'u-alice', '2f ★谁引起的冲突已记录（byMember）')
}

/* ═══ 判据 3：未知 kind 被拒且留痕 —— 不猜、不写 ═══ */
console.log('\n=== 判据3 未知 kind 被拒且留痕 ===')
{
  const disk = makeDiskProbe()
  const merge = createTeamMerge({ maxConflicts: 10 })
  const before = diags.length
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () {
      return { ok: true, data: { cursor: 1, changes: [{ kind: '__nope__', key: 'x', payload: { v: 1 } }] } }
    },
    conflictCenter: merge,
    appliers: { fact: function () { disk.write('should-not-happen'); return { ok: true } } },
    diag: diag, onApplied: onApplied,
  })
  const r = await puller.pullOnce()
  eq(r.applied, 0, '3a ★未知 kind applied=0')
  eq(r.rejected, 1, '3b ★未知 kind rejected=1')
  eq(disk.writes, 0, '3c ★★零写盘（不猜、不写）')
  const newDiags = diags.slice(before).filter(function (d) { return d.indexOf('unknown-kind') >= 0 })
  eq(newDiags.length, 1, '3d ★diag 收到 unknown-kind（留痕）')
  eq(merge.rejected().recent.slice(-1)[0].reason, 'unknown-kind', '3e 拒绝原因被记录')
}

/* ═══ 判据 4：拒绝可见 —— recordRejected 真被调用，不是静默丢弃 ═══ */
console.log('\n=== 判据4 拒绝可见 ===')
{
  const merge = createTeamMerge({ maxConflicts: 10 })
  // 一次跑出 2 种拒绝：脏事实 + 未知 kind
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () {
      return {
        ok: true, data: { cursor: 7, changes: [
          { kind: 'fact', key: 'd', payload: { __dirty: true } },
          { kind: 'bogus', key: 'b', payload: {} },
        ] },
      }
    },
    conflictCenter: merge,
    appliers: { fact: function (p) { return p && p.__dirty ? { ok: false } : { ok: true, outcome: 'applied' } } },
    diag: diag, onApplied: onApplied,
  })
  const r = await puller.pullOnce()
  eq(r.applied, 0, '4a 两条全被拒')
  eq(r.rejected, 2, '4b ★rejected=2')
  const rj = merge.rejected()
  eq(rj.total, 2, '4c ★★conflictCenter.rejected().total === 2（拒绝可见，非静默丢弃）')
  ok(rj.recent.length >= 2, '4d 拒绝明细留存（可见即可追溯）', rj.recent.length)
  ok(rj.recent.some(function (x) { return x.reason === 'gate-rejected' }), '4e 有 gate-rejected 记录')
  ok(rj.recent.some(function (x) { return x.reason === 'unknown-kind' }), '4f 有 unknown-kind 记录')
}

/* ═══ 判据 5：teamEnabled=false ⇒ 零行为（隔离路径，与其他 team 模块同源判据） ═══ */
console.log('\n=== 判据5 隔离：teamEnabled=false 时零行为 ===')
{
  let fetchCalls = 0
  const merge = createTeamMerge({ maxConflicts: 10 })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: false } },
    fetchJson: async function () { fetchCalls += 1; return { ok: true, data: { changes: [] } } },
    conflictCenter: merge,
    appliers: { fact: function () { return { ok: true, outcome: 'applied' } } },
    diag: diag, onApplied: onApplied,
  })
  const r = await puller.pullOnce()
  eq(r.ok, false, '5a 关闭时 ok=false')
  eq(r.reason, 'team-disabled', '5b 原因 = team-disabled')
  eq(fetchCalls, 0, '5c ★★零网络调用（关掉就一点都不动）')
  eq(merge.rejected().total, 0, '5d 零拒绝记录')
  eq(puller.status().enabled, false, '5e status().enabled=false')
}

/* ═══ 判据 6：防重入 —— inflight 期间再次调用直接返回 ═══ */
console.log('\n=== 判据6 防重入 ===')
{
  let release = null
  const gate = new Promise(function (res) { release = res })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () { await gate; return { ok: true, data: { cursor: 1, changes: [] } } },
    conflictCenter: createTeamMerge({ maxConflicts: 10 }),
    appliers: {}, diag: diag, onApplied: onApplied,
  })
  const p1 = puller.pullOnce()
  const r2 = await puller.pullOnce()          // 在途时并发调用
  eq(r2.ok, false, '6a 在途时 ok=false')
  eq(r2.reason, 'inflight', '6b 原因 = inflight')
  release()
  const r1 = await p1
  eq(r1.ok, true, '6c ★先发起的那次仍能正常完成（未被误拒）')
  eq(puller.status().inflight, false, '6d ★inflight 已释放（finally 生效）')
}

/* ═══ 判据 7：游标语义 —— 只在整批成功后前进；失败不前进 ═══ */
console.log('\n=== 判据7 游标语义 ===')
{
  let seen = []
  let mode = 'fail'
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function (p) {
      seen.push(p)
      if (mode === 'fail') return { ok: false, error: 'boom' }
      return { ok: true, data: { cursor: 42, changes: [] } }
    },
    conflictCenter: createTeamMerge({ maxConflicts: 10 }),
    appliers: {}, diag: diag, onApplied: onApplied,
  })
  const r1 = await puller.pullOnce()
  eq(r1.ok, false, '7a 失败返回 ok=false')
  eq(puller.status().since, 0, '7b ★失败不前进游标（since 仍 0 ⇒ 可重试）')
  mode = 'ok'
  const r2 = await puller.pullOnce()
  eq(r2.ok, true, '7c 重试成功')
  eq(puller.status().since, 42, '7d ★成功后游标前进到 42')
  ok(seen[0].indexOf('since=0') >= 0, '7e ★重试时带的是旧游标 since=0（不是丢批）', seen[0])
}

/* ═══ 判据 8：绝不抛 —— 畸形输入全降级 ═══ */
console.log('\n=== 判据8 绝不抛（畸形输入）===')
{
  const merge = createTeamMerge({ maxConflicts: 10 })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () { return { ok: true, data: { cursor: 'NaN', changes: [null, 42, {}, { kind: '' }, { kind: 'fact' }] } } },
    conflictCenter: merge,
    appliers: { fact: function () { throw new Error('applier 内部炸了') } },
    diag: diag, onApplied: onApplied,
  })
  let threw = false
  let r = null
  try { r = await puller.pullOnce() } catch (e) { threw = true }
  eq(threw, false, '8a ★★畸形输入 + applier 抛异常 ⇒ pullOnce 绝不抛')
  ok(r && r.ok === true, '8b 整体仍返回 ok=true（单条失败不影响整批）')
  ok(r.applied === 0, '8c applier 抛异常的那条不算应用', r.applied)
  ok(r.rejected >= 5, '8d ★5 条畸形/异常全部计入 rejected=' + r.rejected + '（>=5）')
  ok(Number.isFinite(puller.status().since) && puller.status().since === 0, '8e ★畸形游标被忽略（since 保持 0，不写 NaN）', puller.status().since)
}

/* ═══ 附加：37 卷 §1 联动 —— onApplied 把作者交给归属索引 ═══ */
console.log('\n=== 附加 37卷§1 联动：作者透传 ===')
{
  appliedLog.length = 0
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () {
      return { ok: true, data: { cursor: 1, changes: [{ kind: 'fact', key: 'mem_x', op: 'upsert', member: { id: 'u-bob', name: 'Bob' }, payload: { key: 'mem_x' } }] } }
    },
    conflictCenter: createTeamMerge({ maxConflicts: 10 }),
    appliers: { fact: function () { return { ok: true, outcome: 'applied' } } },
    diag: diag, onApplied: onApplied,
  })
  await puller.pullOnce()
  eq(appliedLog.length, 1, 'A1 onApplied 被调用 1 次')
  eq(appliedLog[0].key, 'mem_x', 'A2 条目 key 正确')
  eq(appliedLog[0].op, 'upsert', 'A3 op 透传')
  ok(appliedLog[0].member && appliedLog[0].member.id === 'u-bob', 'A4 ★★作者 id 透传（供 team-attribution 落盘）', appliedLog[0].member)
}

/* ═══ 附加：describe / kinds 自描述 ═══ */
console.log('\n=== 附加 自描述 ===')
{
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () { return { ok: true, data: { changes: [] } } },
    conflictCenter: createTeamMerge({ maxConflicts: 10 }),
    appliers: { fact: function () { return { ok: true } } }, diag: diag, onApplied: onApplied,
  })
  const d = puller.describe()
  eq(JSON.stringify(d.kinds), JSON.stringify(['fact', 'procedure', 'handoff']), 'B1 kinds 与导出常量一致')
  eq(JSON.stringify(d.appliers), JSON.stringify(['fact']), 'B2 appliers 如实反映装配结果（缺的不捏造）')
  eq(d.hasFetch, true, 'B3 hasFetch=true')
  eq(d.hasConflictCenter, true, 'B4 hasConflictCenter=true')
  eq(TEAM_PULL_KINDS_PRE.length, 3, 'B5 导出常量长度为 3（守卫锁）')
}

/* ═══ 附加：无 applier ⇒ 拒绝而非自写（结构性保证不绕过 Gate） ═══ */
console.log('\n=== 附加 无 applier 时拒绝（不自造写路径）===')
{
  const merge = createTeamMerge({ maxConflicts: 10 })
  const puller = createTeamPuller({
    engine: { config: { teamEnabled: true } },
    fetchJson: async function () { return { ok: true, data: { cursor: 1, changes: [{ kind: 'procedure', key: 'p1', payload: {} }] } } },
    conflictCenter: merge,
    appliers: { fact: function () { return { ok: true } } },   // ★故意不给 procedure
    diag: diag, onApplied: onApplied,
  })
  const r = await puller.pullOnce()
  eq(r.applied, 0, 'C1 ★没给 applier ⇒ applied=0（不 fallback 自写）')
  eq(r.rejected, 1, 'C2 rejected=1')
  eq(merge.rejected().recent.slice(-1)[0].reason, 'no-applier', 'C3 原因 = no-applier（可诊断）')
}

/* ═══ 汇总 ═══ */
console.log('\n' + '='.repeat(52))
if (failures.length) { console.log('失败项:'); for (const f of failures) console.log('  ✗ ' + f) }
console.log('PASS ' + pass + ' / FAIL ' + fail)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
