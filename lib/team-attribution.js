/**
 * team-attribution.js — 条目级「谁编辑了」旁挂索引（B12 · 37 卷 §1 第一必做项）
 *
 * 背景（37 卷 §1 原文）：
 *   下行同步时，远端条目被合并回本机后 **member 信息丢失** ⇒ 前端无法显示「谁编辑的」。
 *   修法：**旁挂索引**（side-car），**绝不触碰 Markdown 内容**（保住 G-E5「磁盘仍是人类可读 Markdown」）。
 *
 * 数据结构：
 *   { schema: 1, items: { "<key>": { memberId, memberName, at, op } } }
 *
 * 落盘位置：与 team-conflicts 同级（同一数据目录）。
 *
 * 三条判据（37 卷 §1）：
 *   正路径：真 merge 下行含 member 的条目 ⇒ 断言该 key 的作者 = 上传者 id
 *   负路径：下行条目 **缺 member** ⇒ **不写入**（不留空占位）
 *   隔离路径：teamEnabled=false ⇒ **该文件不该被创建**
 *
 * 纪律：纯 CRLF；ES5 语法（宿主零构建）；**绝不抛**（所有公开函数 try/catch 兜底）。
 */

/** 文件名（与 team-conflicts 同级） */
const FILE_NAME_PRE = 'team-attribution.json'
/** schema 版本：结构变了就 +1，读侧据此决定是否迁移 */
const SCHEMA_PRE = 1
/** 有界：最多保留多少条归属记录（防无限增长；超出丢最旧） */
const MAX_ITEMS_PRE = 2000
/** op 合法集合（写入时会校验，非法值归一为 'edit'） */
const OPS_PRE = ['create', 'edit', 'merge', 'delete', 'resolve']

function normOpPre(op) {
  const s = String(op === undefined || op === null ? '' : op)
  for (let i = 0; i < OPS_PRE.length; i++) if (OPS_PRE[i] === s) return s
  return 'edit'
}

function strPre(v) { return String(v === undefined || v === null ? '' : v) }

/** 时间戳：外部传入的 now 优先（便于测试确定性），否则 Date.now() */
function nowOfPre(nowFn) {
  try { return typeof nowFn === 'function' ? Number(nowFn()) : Date.now() } catch (_) { return Date.now() }
}

/**
 * 创建归属索引实例。
 *
 * @param {Object} opt
 *   - opt.teamEnabled : boolean —— **false 时所有写操作直接短路**（隔离路径判据）
 *   - opt.now         : () => number —— 时间源（测试确定性）
 *   - opt.max         : number —— 有界上限
 *   - opt.onChange    : () => void —— 变更钩子（供 index.js 触发原子写）
 */
function createTeamAttribution(opt) {
  const o = opt || {}
  const teamEnabled = o.teamEnabled === true
  const nowFn = typeof o.now === 'function' ? o.now : null
  const maxItems = (function () {
    const n = Number(o.max)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : MAX_ITEMS_PRE
  })()
  /** 条目表：key -> { memberId, memberName, at, op }。**用 Map 保插入序**，便于按序淘汰最旧。 */
  const items = new Map()
  /** 写次数（供测试断言「负路径没有写入」） */
  let writeCount = 0

  function touch() {
    try { if (typeof o.onChange === 'function') o.onChange() } catch (_) { /* 钩子绝不抛 */ }
  }

  /**
   * 记录一条归属。
   *
   * ★负路径（37 卷 §1）：**缺 member ⇒ 不写入**（不留空占位、不覆盖旧值）。
   *
   * @param {string} key  条目稳定键（与 Markdown 条目一一对应，用于前端查表）
   * @param {Object} member  { id, name } 或 { memberId, memberName }（兼容两种命名）
   * @param {string} op   create | edit | merge | delete | resolve
   * @returns {{ ok:boolean, reason?:string }}
   */
  function record(key, member, op) {
    try {
      // ① 隔离路径：团队功能关闭 ⇒ 完全不写（连内存都不写）
      if (!teamEnabled) return { ok: false, reason: 'team-disabled' }
      const k = strPre(key)
      if (!k) return { ok: false, reason: 'no-key' }
      // ② 负路径：缺 member ⇒ 不写入
      const m = member || {}
      const memberId = strPre(m.id !== undefined ? m.id : m.memberId)
      const memberName = strPre(m.name !== undefined ? m.name : m.memberName)
      if (!memberId && !memberName) return { ok: false, reason: 'no-member' }
      // ③ 正常写入
      items.set(k, {
        memberId: memberId,
        memberName: memberName,
        at: nowOfPre(nowFn),
        op: normOpPre(op),
      })
      writeCount += 1
      // ④ 有界：超出丢最旧（Map 保插入序 ⇒ 首个即最旧）
      while (items.size > maxItems) {
        const oldest = items.keys().next()
        if (oldest.done) break
        items.delete(oldest.value)
      }
      touch()
      return { ok: true }
    } catch (_) { return { ok: false, reason: 'threw' } }
  }

  /**
   * 批量记录（下行合并时按条目列表一次写入）。
   * 返回 { ok, written, skipped } —— skipped 计入缺 member 的条数。
   */
  function recordMany(list) {
    let written = 0; let skipped = 0
    try {
      const arr = Array.isArray(list) ? list : []
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i] || {}
        const r = record(it.key, it.member, it.op)
        if (r.ok) written += 1; else skipped += 1
      }
    } catch (_) { /* 绝不抛 */ }
    return { ok: true, written: written, skipped: skipped }
  }

  /** 查一条。**未命中返回 null**（前端据此决定是否渲染徽标）。 */
  function get(key) {
    try {
      const hit = items.get(strPre(key))
      return hit ? Object.assign({}, hit) : null
    } catch (_) { return null }
  }

  /** 取全部（快照，供「谁写的」列表）。 */
  function all() {
    try {
      const out = []
      items.forEach(function (v, k) { out.push(Object.assign({ key: k }, v)) })
      return out
    } catch (_) { return [] }
  }

  function size() { try { return items.size } catch (_) { return 0 } }
  function writes() { return writeCount }

  /** 序列化（供 index.js 原子写落盘）。teamEnabled=false 时 **不给数据**（隔离路径）。 */
  function toJSON() {
    try {
      if (!teamEnabled) return { schema: SCHEMA_PRE, items: {} }
      const obj = {}
      items.forEach(function (v, k) { obj[k] = Object.assign({}, v) })
      return { schema: SCHEMA_PRE, items: obj }
    } catch (_) { return { schema: SCHEMA_PRE, items: {} } }
  }

  /**
   * 从磁盘快照载入（index.js 读到文件后调用）。
   * **id 非法/缺 member 的记录一律丢弃**（不让坏数据进内存）。
   */
  function load(state) {
    try {
      if (!teamEnabled) return { ok: true, loaded: 0 }   // 隔离路径：不加载
      const src = state && state.items && typeof state.items === 'object' ? state.items : {}
      let n = 0
      const keys = Object.keys(src)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const v = src[k] || {}
        if (!v.memberId && !v.memberName) continue    // 负路径：坏数据丢弃
        items.set(String(k), {
          memberId: strPre(v.memberId),
          memberName: strPre(v.memberName),
          at: Number(v.at) || 0,
          op: normOpPre(v.op),
        })
        n += 1
      }
      while (items.size > maxItems) {
        const oldest = items.keys().next()
        if (oldest.done) break
        items.delete(oldest.value)
      }
      return { ok: true, loaded: n }
    } catch (_) { return { ok: false, reason: 'threw' } }
  }

  function clear() { const n = items.size; items.clear(); return { ok: true, cleared: n } }

  /** 自述（调试面板用）。 */
  function describe() {
    return {
      kind: 'team-attribution',
      file: FILE_NAME_PRE,
      schema: SCHEMA_PRE,
      teamEnabled: teamEnabled,
      size: size(),
      writes: writeCount,
      max: maxItems,
    }
  }

  return {
    record: record, recordMany: recordMany, get: get, all: all,
    size: size, writes: writes, toJSON: toJSON, load: load,
    clear: clear, describe: describe,
  }
}

export { createTeamAttribution }
export const TEAM_ATTRIBUTION_FILE = FILE_NAME_PRE
export const TEAM_ATTRIBUTION_SCHEMA = SCHEMA_PRE

